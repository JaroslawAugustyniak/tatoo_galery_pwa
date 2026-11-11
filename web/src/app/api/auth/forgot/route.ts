import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueChallenge, maskEmail, normalizeEmail } from "@/lib/challenge";

export const dynamic = "force-dynamic";

/** POST { email } – odpowiedź identyczna dla istniejącego i nieistniejącego konta (brak enumeracji). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Nieprawidłowy e-mail" }, { status: 400 });

  const artist = await prisma.artist.findUnique({ where: { email }, select: { id: true } });
  let challengeId: string;
  try {
    challengeId = await issueChallenge(email, artist?.id ?? null, "RESET");
  } catch (e) {
    // błąd wysyłki logujemy, ale nie zdradzamy go klientowi (zdradziłby istnienie konta)
    console.error("forgot", e);
    challengeId = await issueChallenge(email, null, "RESET");
  }
  return NextResponse.json({ challengeId, email: maskEmail(email) }, { status: 202 });
}
