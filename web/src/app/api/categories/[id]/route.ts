import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionArtistId } from "@/lib/session";
import { deleteMedia, slugify } from "@/lib/image";

export const dynamic = "force-dynamic";
type Ctx = { params: { id: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  const artistId = getSessionArtistId();
  if (!artistId) return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Podaj nazwę" }, { status: 400 });

  try {
    // updateMany z artistId => nie da się edytować cudzych danych
    const res = await prisma.category.updateMany({
      where: { id: params.id, artistId },
      data: { name, slug: slugify(name) },
    });
    if (res.count === 0) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Masz już kategorię o takiej nazwie" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const artistId = getSessionArtistId();
  if (!artistId) return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });

  const cat = await prisma.category.findFirst({
    where: { id: params.id, artistId },
    include: { artworks: { select: { displayUrl: true } } },
  });
  if (!cat) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });

  await prisma.category.delete({ where: { id: cat.id } }); // prace usuwa kaskada
  await Promise.all([deleteMedia(artistId, cat.avatarUrl), ...cat.artworks.map((a) => deleteMedia(artistId, a.displayUrl))]);
  return NextResponse.json({ ok: true });
}
