import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { isValidSlug, MIN_PASSWORD } from "@/lib/validation";
import { issueChallenge, maskEmail, normalizeEmail } from "@/lib/challenge";

export const dynamic = "force-dynamic";

/** Zakłada konto (niezweryfikowane) i wysyła kod 2FA. Sesja powstaje dopiero po POST /api/auth/verify. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const slug = String(body?.slug ?? "").trim().toLowerCase();
  const email = normalizeEmail(body?.email);
  const password = String(body?.password ?? "");

  if (!name) return NextResponse.json({ error: "Podaj nazwę" }, { status: 400 });
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "Nieprawidłowy adres (a-z, 0-9, myślnik, 3-32 znaki)" }, { status: 400 });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Nieprawidłowy e-mail" }, { status: 400 });
  if (password.length < MIN_PASSWORD) return NextResponse.json({ error: `Hasło min. ${MIN_PASSWORD} znaków` }, { status: 400 });

  // porzucone, puste i niezweryfikowane rejestracje nie blokują adresów w nieskończoność
  await prisma.artist.deleteMany({
    where: { emailVerifiedAt: null, createdAt: { lt: new Date(Date.now() - 24 * 3600_000) }, categories: { none: {} } },
  });

  try {
    const byEmail = await prisma.artist.findUnique({ where: { email } });
    if (byEmail?.emailVerifiedAt) {
      return NextResponse.json({ error: "Adres lub e-mail jest już zajęty" }, { status: 409 });
    }
    const bySlug = await prisma.artist.findUnique({ where: { slug } });
    if (bySlug && bySlug.id !== byEmail?.id) {
      return NextResponse.json({ error: "Adres lub e-mail jest już zajęty" }, { status: 409 });
    }

    const data = { name, slug, passwordHash: hashPassword(password) };
    // ponowna próba rejestracji tego samego (niezweryfikowanego) maila nadpisuje dane
    const artist = byEmail
      ? await prisma.artist.update({ where: { id: byEmail.id }, data })
      : await prisma.artist.create({ data: { ...data, email } });

    const challengeId = await issueChallenge(email, artist.id, "LOGIN");
    return NextResponse.json({ challengeId, email: maskEmail(email) }, { status: 202 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Adres lub e-mail jest już zajęty" }, { status: 409 });
    }
    console.error("register", e);
    return NextResponse.json({ error: "Nie udało się wysłać kodu. Spróbuj ponownie." }, { status: 503 });
  }
}
