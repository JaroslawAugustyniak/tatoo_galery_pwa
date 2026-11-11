"use client";

import { useCallback, useEffect, useState } from "react";
import CategoryDrawer from "./CategoryDrawer";
import Slideshow from "./Slideshow";
import type { GalleryDTO } from "@/lib/types";

type Props = { slug: string; artistName: string };

export default function GalleryShell({ slug, artistName }: Props) {
  const [gallery, setGallery] = useState<GalleryDTO | null>(null);
  const [error, setError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [sync, setSync] = useState<{ done: number; total: number } | null>(null);

  // Dane: SW (StaleWhileRevalidate) zwraca cache także offline
  useEffect(() => {
    fetch(`/api/t/${slug}/gallery`)
      .then((r) => (r.ok ? (r.json() as Promise<GalleryDTO>) : Promise.reject()))
      .then((g) => {
        setGallery(g);
        setActiveId((cur) => cur ?? g.categories[0]?.id ?? null);
      })
      .catch(() => setError(true));
  }, [slug]);

  // "Pierwsza synchronizacja": pobierz wszystkie obrazy, SW zapisze je w cache (Cache-First)
  useEffect(() => {
    if (!gallery) return;
    const urls = [
      ...(gallery.logoUrl ? [gallery.logoUrl] : []),
      ...gallery.categories.flatMap((c) => [c.avatarUrl, ...c.artworks.map((a) => a.displayUrl)]),
    ];
    if (urls.length === 0) return;
    let cancelled = false;
    let done = 0;
    const queue = [...urls];
    setSync({ done: 0, total: urls.length });
    const worker = async () => {
      while (queue.length && !cancelled) {
        await fetch(queue.shift()!).catch(() => undefined);
        if (!cancelled) setSync({ done: ++done, total: urls.length });
      }
    };
    Promise.all([worker(), worker(), worker()]).then(() => !cancelled && setTimeout(() => setSync(null), 2500));
    return () => {
      cancelled = true;
    };
  }, [gallery]);

  const selectCategory = useCallback((id: string) => {
    setActiveId(id);
    setIndex(0);
  }, []);

  const category = gallery?.categories.find((c) => c.id === activeId);

  return (
    <main className="fixed inset-0">
      {error && !gallery && (
        <div className="grid h-full place-items-center p-6 text-center text-neutral-400">
          Nie udało się wczytać galerii. Otwórz ją raz z internetem, aby była dostępna offline.
        </div>
      )}

      {category && <Slideshow artworks={category.artworks} index={index} onIndexChange={setIndex} />}
      {gallery && !category && (
        <div className="grid h-full place-items-center text-neutral-500">Galeria jest jeszcze pusta</div>
      )}

      {gallery?.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={gallery?.logoUrl} alt="" draggable={false} className="absolute left-4 top-4 max-h-24 max-w-full object-contain" />
              )}

      <button
        aria-label="Kategorie"
        onClick={() => setDrawer(true)}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 flex h-12 items-center gap-2 rounded-full bg-black/60 px-4 backdrop-blur"
      >
        <span className="text-xl">☰</span>
        <span className="max-w-[40vw] truncate">{category?.name ?? artistName}</span>
      </button>

      {sync && (
        <div className="pointer-events-none absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 rounded-full bg-black/60 px-3 py-2 text-xs text-neutral-300">
          {sync.done < sync.total ? `Offline: ${sync.done}/${sync.total}` : "✓ Dostępne offline"}
        </div>
      )}

      <CategoryDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        artistName={gallery?.name ?? artistName}
        logoUrl={gallery?.logoUrl}
        categories={gallery?.categories ?? []}
        activeId={activeId}
        onSelect={selectCategory}
      />
    </main>
  );
}
