import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionArtistId } from "@/lib/session";
import { deleteMedia, processAndStore } from "@/lib/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 30 * 1024 * 1024;

/** POST multipart (file) – podmienia obraz zdjęcia; tytuł, kategoria i kolejność zostają. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const artistId = getSessionArtistId();
  if (!artistId) return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });

  const artwork = await prisma.artwork.findFirst({ where: { id: params.id, artistId } });
  if (!artwork) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });

  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Brak pliku" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Plik za duży (max 30 MB)" }, { status: 413 });

  let processed;
  try {
    processed = await processAndStore(artistId, Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy plik graficzny" }, { status: 415 });
  }

  // nowy plik ma nowy UUID => URL się zmienia, więc cache przeglądarki/SW nie pokaże starego obrazu
  const updated = await prisma.artwork.update({
    where: { id: artwork.id },
    data: { displayUrl: processed.fullUrl, blurDataUrl: processed.blurDataUrl },
  });
  await deleteMedia(artistId, artwork.displayUrl);
  return NextResponse.json({ artwork: updated });
}
