import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { verifyChallenge } from "@/lib/challenge";
import { MIN_PASSWORD } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** POST { challengeId, code, newPassword } */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const newPassword = String(body?.newPassword ?? "");
  // walidacja hasła PRZED zużyciem kodu
  if (newPassword.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `Hasło min. ${MIN_PASSWORD} znaków` }, { status: 400 });
  }

  const result = await verifyChallenge(String(body?.challengeId ?? ""), body?.code, "RESET");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await prisma.artist.update({
    where: { id: result.artistId },
    data: { passwordHash: hashPassword(newPassword), emailVerifiedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
