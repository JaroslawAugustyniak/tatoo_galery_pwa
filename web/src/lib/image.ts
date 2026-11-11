import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

/** Pliki każdego tenanta leżą w osobnym katalogu: UPLOAD_DIR/tenants/{artistId}/ */
export const tenantDir = (artistId: string) => path.join(UPLOAD_DIR, "tenants", artistId);

export type ProcessedImage = {
  thumbUrl: string; // 300x300 WEBP (avatar)
  fullUrl: string; // max 2560px WEBP q85 (slajd)
  blurDataUrl: string; // mały base64 WEBP
};

/** Przetwarza wgrany plik na dwa warianty WEBP + blurDataURL i zapisuje je w UPLOAD_DIR. */
export async function processAndStore(artistId: string, input: Buffer): Promise<ProcessedImage> {
  const dir = tenantDir(artistId);
  await mkdir(dir, { recursive: true });
  const id = randomUUID();

  // rotate() uwzględnia EXIF orientation; wyrzuca to też metadane (prywatność - GPS)
  const base = sharp(input, { failOn: "error" }).rotate();

  const [thumb, full, blur] = await Promise.all([
    base.clone().resize(300, 300, { fit: "cover", position: "attention" }).webp({ quality: 80 }).toBuffer(),
    base
      .clone()
      .resize(2560, 2560, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer(),
    base.clone().resize(16, 16, { fit: "inside" }).blur(1).webp({ quality: 40 }).toBuffer(),
  ]);

  await Promise.all([
    writeFile(path.join(dir, `${id}-thumb.webp`), thumb),
    writeFile(path.join(dir, `${id}-full.webp`), full),
  ]);

  return {
    thumbUrl: `/api/media/${artistId}/${id}-thumb.webp`,
    fullUrl: `/api/media/${artistId}/${id}-full.webp`,
    blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
  };
}

export function slugify(input: string): string {
  return (
    input
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ł/g, "l")
      .replace(/Ł/g, "L")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "kategoria"
  );
}

/** Usuwa oba warianty (thumb + full) pliku tenanta na podstawie URL-a /api/media/{artistId}/{uuid}-(thumb|full).webp */
export async function deleteMedia(artistId: string, url: string | null | undefined) {
  const m = url?.match(/\/([a-f0-9-]{36})-(?:thumb|full)\.webp$/);
  if (!m) return;
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    ["thumb", "full"].map((v) => rm(path.join(tenantDir(artistId), `${m[1]}-${v}.webp`), { force: true })),
  );
}

/** Logo studia: zachowuje proporcje i przezroczystość (bez kadrowania), max 800x400. Zapisuje tylko wariant -full. */
export async function processLogo(artistId: string, input: Buffer): Promise<string> {
  const dir = tenantDir(artistId);
  await mkdir(dir, { recursive: true });
  const id = randomUUID();
  const buf = await sharp(input, { failOn: "error" })
    .rotate()
    .resize(800, 400, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90, alphaQuality: 100 })
    .toBuffer();
  await writeFile(path.join(dir, `${id}-full.webp`), buf);
  return `/api/media/${artistId}/${id}-full.webp`;
}
