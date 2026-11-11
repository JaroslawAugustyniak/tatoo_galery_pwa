import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { issueChallenge, maskEmail, normalizeEmail } from "@/lib/challenge";

export const dynamic = "force-dynamic";

/** Krok 1 logowania: hasło => kod 2FA na maila. Sesja po POST /api/auth/verify. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const password = String(body?.password ?? "");

  const artist = await prisma.artist.findUnique({ where: { email } });
  if (!artist || !verifyPassword(password, artist.passwordHash)) {
    return NextResponse.json({ error: "Nieprawidłowy e-mail lub hasło" }, { status: 401 });
  }
  try {
    const challengeId = await issueChallenge(email, artist.id, "LOGIN");
    return NextResponse.json({ challengeId, email: maskEmail(email) }, { status: 202 });
  } catch (e) {
    console.error("login", e);
    return NextResponse.json({ error: "Nie udało się wysłać kodu. Spróbuj ponownie." }, { status: 503 });
  }
}
