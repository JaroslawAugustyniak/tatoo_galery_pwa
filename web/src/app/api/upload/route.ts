import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionArtistId } from "@/lib/session";
import { deleteMedia, processAndStore, processLogo, slugify } from "@/lib/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 30 * 1024 * 1024;

/**
 * Wymaga sesji; tenant (artistId) pochodzi z sesji, nigdy z requestu.
 * POST multipart/form-data:
 *  - file:       plik graficzny
 *  - target:     "category" | "artwork" | "logo" (logo studia)
 *  - name:       nazwa kategorii (target=category)
 *  - categoryId: id kategorii (target=artwork)
 *  - title:      opcjonalny tytuł pracy (target=artwork)
 */
export async function POST(req: Request) {
  const artistId = getSessionArtistId();
  if (!artistId) return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const target = form.get("target");

  if (!(file instanceof File)) return NextResponse.json({ error: "Brak pliku" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Plik za duży (max 30 MB)" }, { status: 413 });
  if (target !== "category" && target !== "artwork" && target !== "logo") {
    return NextResponse.json({ error: "Nieprawidłowy target" }, { status: 400 });
  }

  if (target === "logo") {
    let logoUrl: string;
    try {
      logoUrl = await processLogo(artistId, Buffer.from(await file.arrayBuffer()));
    } catch {
      return NextResponse.json({ error: "Nieprawidłowy plik graficzny" }, { status: 415 });
    }
    const old = await prisma.artist.findUnique({ where: { id: artistId }, select: { avatarUrl: true } });
    await prisma.artist.update({ where: { id: artistId }, data: { avatarUrl: logoUrl } });
    await deleteMedia(artistId, old?.avatarUrl); // stare logo nie zostaje na dysku
    return NextResponse.json({ logoUrl }, { status: 201 });
  }

  // Walidacja przed zapisem, żeby nie zostawiać osieroconych plików
  let categoryId = "";
  let name = "";
  if (target === "artwork") {
    categoryId = String(form.get("categoryId") ?? "");
    const exists = await prisma.category.findFirst({ where: { id: categoryId, artistId }, select: { id: true } });
    if (!exists) return NextResponse.json({ error: "Nie ma takiej kategorii" }, { status: 400 });
  } else {
    name = String(form.get("name") ?? "").trim();
    if (!name) return NextResponse.json({ error: "Podaj nazwę kategorii" }, { status: 400 });
  }

  let processed;
  try {
    processed = await processAndStore(artistId, Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy plik graficzny" }, { status: 415 });
  }

  if (target === "category") {
    try {
      const lastCat = await prisma.category.aggregate({ where: { artistId }, _max: { order: true } });
      const category = await prisma.category.create({
        data: {
          artistId,
          name,
          slug: slugify(name),
          avatarUrl: processed.thumbUrl,
          order: (lastCat._max.order ?? -1) + 1,
        },
      });
      return NextResponse.json({ category, ...processed }, { status: 201 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json({ error: "Masz już kategorię o takiej nazwie" }, { status: 409 });
      }
      throw e;
    }
  }

  const last = await prisma.artwork.aggregate({ where: { artistId, categoryId }, _max: { order: true } });
  const title = String(form.get("title") ?? "").trim() || null;
  const artwork = await prisma.artwork.create({
    data: {
      artistId,
      title,
      displayUrl: processed.fullUrl,
      blurDataUrl: processed.blurDataUrl,
      categoryId,
      order: (last._max.order ?? -1) + 1,
    },
  });
  return NextResponse.json({ artwork, ...processed }, { status: 201 });
}
