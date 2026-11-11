import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionArtistId } from "@/lib/session";
import { deleteMedia } from "@/lib/image";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

/** PATCH { title?: string | null, categoryId?: string } – zmiana tytułu i/lub przeniesienie do innej kategorii */
export async function PATCH(req: Request, { params }: Ctx) {
  const artistId = getSessionArtistId();
  if (!artistId) return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const artwork = await prisma.artwork.findFirst({ where: { id: params.id, artistId } });
  if (!artwork) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });

  const data: { title?: string | null; categoryId?: string; order?: number } = {};
  if (body && "title" in body) data.title = String(body.title ?? "").trim() || null;

  if (body?.categoryId && body.categoryId !== artwork.categoryId) {
    const target = await prisma.category.findFirst({ where: { id: String(body.categoryId), artistId }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "Nie ma takiej kategorii" }, { status: 400 });
    const last = await prisma.artwork.aggregate({ where: { artistId, categoryId: target.id }, _max: { order: true } });
    data.categoryId = target.id;
    data.order = (last._max.order ?? -1) + 1; // na koniec nowej kategorii
  }

  await prisma.artwork.update({ where: { id: artwork.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const artistId = getSessionArtistId();
  if (!artistId) return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });

  const artwork = await prisma.artwork.findFirst({ where: { id: params.id, artistId } });
  if (!artwork) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });

  await prisma.artwork.delete({ where: { id: artwork.id } });
  await deleteMedia(artistId, artwork.displayUrl);
  return NextResponse.json({ ok: true });
}
