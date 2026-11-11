import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionArtistId } from "@/lib/session";
import { hashPassword, verifyPassword } from "@/lib/password";
import { MIN_PASSWORD } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** POST { currentPassword, newPassword } */
export async function POST(req: Request) {
  const id = getSessionArtistId();
  if (!id) return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const current = String(body?.currentPassword ?? "");
  const next = String(body?.newPassword ?? "");

  const artist = await prisma.artist.findUnique({ where: { id }, select: { passwordHash: true } });
  if (!artist || !verifyPassword(current, artist.passwordHash)) {
    return NextResponse.json({ error: "Aktualne hasło jest nieprawidłowe" }, { status: 403 });
  }
  if (next.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `Nowe hasło min. ${MIN_PASSWORD} znaków` }, { status: 400 });
  }
  if (next === current) {
    return NextResponse.json({ error: "Nowe hasło musi różnić się od aktualnego" }, { status: 400 });
  }
  await prisma.artist.update({ where: { id }, data: { passwordHash: hashPassword(next) } });
  return NextResponse.json({ ok: true });
}
