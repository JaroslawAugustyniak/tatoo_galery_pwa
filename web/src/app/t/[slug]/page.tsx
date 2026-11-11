import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import GalleryShell from "@/components/GalleryShell";

export const dynamic = "force-dynamic";

async function getArtist(slug: string) {
  return prisma.artist.findUnique({ where: { slug }, select: { name: true, slug: true } });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const artist = await getArtist(params.slug);
  const base = headers().get("x-tenant-base") ?? `/t/${params.slug}`;
  return { title: artist?.name ?? "Galeria", manifest: `${base}/manifest.webmanifest` };
}

export default async function TenantPage({ params }: { params: { slug: string } }) {
  const artist = await getArtist(params.slug);
  if (!artist) notFound();
  return <GalleryShell slug={artist.slug} artistName={artist.name} />;
}
