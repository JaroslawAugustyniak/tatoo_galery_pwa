import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const artist = await prisma.artist.findUnique({
    where: { slug: params.slug },
    select: {
      name: true,
      slug: true,
      avatarUrl: true,
      categories: {
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          avatarUrl: true,
          artworks: {
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            select: { id: true, title: true, displayUrl: true, blurDataUrl: true, order: true },
          },
        },
      },
    },
  });
  if (!artist) return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
  const { avatarUrl, ...rest } = artist;
  return NextResponse.json({ ...rest, logoUrl: avatarUrl });
}
