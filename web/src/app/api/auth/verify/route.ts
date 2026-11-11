import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";
import { verifyChallenge } from "@/lib/challenge";

export const dynamic = "force-dynamic";

/** Krok 2 logowania/rejestracji: POST { challengeId, code } => sesja. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = await verifyChallenge(String(body?.challengeId ?? ""), body?.code, "LOGIN");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const artist = await prisma.artist.update({
    where: { id: result.artistId },
    data: { emailVerifiedAt: new Date() }, // poprawny kod potwierdza także adres e-mail
    select: { id: true, name: true, slug: true, avatarUrl: true },
  });
  setSessionCookie(artist.id);
  return NextResponse.json({ id: artist.id, name: artist.name, slug: artist.slug, logoUrl: artist.avatarUrl });
}
