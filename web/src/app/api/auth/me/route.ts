import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionArtistId } from "@/lib/session";
import { isValidSlug } from "@/lib/validation";

export const dynamic = "force-dynamic";

const select = { id: true, name: true, slug: true, avatarUrl: true } as const;
const toMe = (a: { id: string; name: string; slug: string; avatarUrl: string | null }) => ({
  id: a.id,
  name: a.name,
  slug: a.slug,
  logoUrl: a.avatarUrl,
});

export async function GET() {
  const id = getSessionArtistId();
  const artist = id ? await prisma.artist.findUnique({ where: { id }, select }) : null;
  if (!artist) return NextResponse.json({ error: "Niezalogowany" }, { status: 401 });
  return NextResponse.json(toMe(artist));
}

/** PATCH { name, slug } – edycja danych studia */
export async function PATCH(req: Request) {
  const id = getSessionArtistId();
  if (!id) return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = String(body?.name ?? "").trim();
  const slug = String(body?.slug ?? "").trim().toLowerCase();
  if (!name) return NextResponse.json({ error: "Podaj nazwę" }, { status: 400 });
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: "Nieprawidłowy adres (a-z, 0-9, myślnik, 3-32 znaki)" }, { status: 400 });
  }

  try {
    const artist = await prisma.artist.update({ where: { id }, data: { name, slug }, select });
    return NextResponse.json(toMe(artist));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Ten adres jest już zajęty" }, { status: 409 });
    }
    throw e;
  }
}
