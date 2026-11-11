import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionArtistId } from "@/lib/session";
import { deleteMedia } from "@/lib/image";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const id = getSessionArtistId();
  if (!id) return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });

  const artist = await prisma.artist.findUnique({ where: { id }, select: { avatarUrl: true } });
  await prisma.artist.update({ where: { id }, data: { avatarUrl: null } });
  await deleteMedia(id, artist?.avatarUrl);
  return NextResponse.json({ ok: true });
}
