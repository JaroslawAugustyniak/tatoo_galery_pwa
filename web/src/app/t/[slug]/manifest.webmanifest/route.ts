import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Manifest per tenant: każdy tatuator instaluje własną aplikację z własnym zakresem
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const artist = await prisma.artist.findUnique({ where: { slug: params.slug }, select: { name: true } });
  if (!artist) return new Response("Not found", { status: 404 });

  const base = req.headers.get("x-tenant-base") ?? `/t/${params.slug}`; // "" na subdomenie
  return Response.json(
    {
      name: artist.name,
      short_name: artist.name.slice(0, 12),
      start_url: base || "/",
      scope: `${base}/`,
      display: "standalone",
      orientation: "any",
      background_color: "#0a0a0a",
      theme_color: "#0a0a0a",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
