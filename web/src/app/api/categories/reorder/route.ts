import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionArtistId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** POST { ids: string[] } – pełna lista kategorii tenanta w nowej kolejności */
export async function POST(req: Request) {
  const artistId = getSessionArtistId();
  if (!artistId) return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];

  const owned = await prisma.category.findMany({ where: { artistId }, select: { id: true } });
  if (ids.length !== owned.length || new Set(ids).size !== ids.length || !ids.every((id) => owned.some((o) => o.id === id))) {
    return NextResponse.json({ error: "Nieprawidłowa lista" }, { status: 400 });
  }
  await prisma.$transaction(ids.map((id, order) => prisma.category.update({ where: { id }, data: { order } })));
  return NextResponse.json({ ok: true });
}
