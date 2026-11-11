import { readFile } from "node:fs/promises";
import path from "node:path";
import { tenantDir } from "@/lib/image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Next nie serwuje plików dodanych po buildzie z /public, więc czytamy je z wolumenu.
export async function GET(_req: Request, { params }: { params: { artistId: string; file: string } }) {
  const { artistId, file } = params;
  // ścisła walidacja => brak path traversal
  if (!/^[a-z0-9]{10,40}$/.test(artistId) || !/^[a-f0-9-]{36}-(thumb|full)\.webp$/.test(file)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const data = await readFile(path.join(tenantDir(artistId), file));
    return new Response(data, {
      headers: {
        "Content-Type": "image/webp",
        // nazwy zawierają UUID => zawartość niezmienna
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
