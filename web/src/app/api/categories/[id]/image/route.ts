import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionArtistId } from "@/lib/session";
import { deleteMedia, processAndStore } from "@/lib/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 30 * 1024 * 1024;

/** POST multipart (file) – podmienia zdjęcie określające kategorię (okrągły avatar 300x300). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const artistId = getSessionArtistId();
  if (!artistId) return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });

  const category = await prisma.category.findFirst({ where: { id: params.id, artistId } });
  if (!category) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });

  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Brak pliku" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Plik za duży (max 30 MB)" }, { status: 413 });

  let processed;
  try {
    processed = await processAndStore(artistId, Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy plik graficzny" }, { status: 415 });
  }

  // nowy UUID => nowy URL, więc cache przeglądarki i Service Workera nie pokaże starego avatara
  const updated = await prisma.category.update({ where: { id: category.id }, data: { avatarUrl: processed.thumbUrl } });
  await deleteMedia(artistId, category.avatarUrl);
  return NextResponse.json({ category: updated });
}
