"use client";

import { useCallback, useEffect, useState } from "react";
import CategoryDrawer from "./CategoryDrawer";
import Slideshow from "./Slideshow";
import type { GalleryDTO } from "@/lib/types";

type Props = { slug: string; artistName: string };

// Nazwy cache muszą być takie same jak w src/app/sw.ts
const MEDIA_CACHE = "gallery-media";
const DATA_CACHE = "gallery-data";

// Fullscreen API z prefiksem WebKit (iPadOS/Safari). iPhone nie wspiera pełnego ekranu dla stron – tam przycisk się nie pojawi.
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
const fsElement = () => (document as FsDoc).fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;

export default function GalleryShell({ slug, artistName }: Props) {
  const [gallery, setGallery] = useState<GalleryDTO | null>(null);
  const [error, setError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [fsSupported, setFsSupported] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sync, setSync] = useState<{ done: number; total: number; failed: number } | null>(null);

  // Dane: SW (StaleWhileRevalidate) zwraca cache także offline.
  // Dodatkowo zapisujemy odpowiedź sami – przy pierwszej wizycie SW jeszcze nie kontroluje strony i nic by nie zbuforował.
  useEffect(() => {
    const url = `/api/t/${slug}/gallery`;
    fetch(url)
      .then((r) => {
        if (!r.ok) return Promise.reject();
        const copy = r.clone();
        if ("caches" in window) caches.open(DATA_CACHE).then((c) => c.put(url, copy)).catch(() => undefined);
        return r.json() as Promise<GalleryDTO>;
      })
      .then((g) => {
        setGallery(g);
        setActiveId((cur) => cur ?? g.categories[0]?.id ?? null);
      })
      .catch(() => setError(true));
  }, [slug]);

  // "Pierwsza synchronizacja": zapisz wszystkie obrazy w pamięci urządzenia (Cache API, ten sam cache co CacheFirst w SW).
  // Zapis robimy sami, więc działa od pierwszej wizyty – nie zależy od tego, czy SW zdążył przejąć stronę.
  useEffect(() => {
    if (!gallery) return;
    if (!("caches" in window) || !window.isSecureContext) {
      setSync({ done: 0, total: 0, failed: -1 });
      return;
    }
    const urls = [
      ...(gallery.logoUrl ? [gallery.logoUrl] : []),
      ...gallery.categories.flatMap((c) => [c.avatarUrl, ...c.artworks.map((a) => a.displayUrl)]),
    ].filter((u): u is string => Boolean(u));
    const unique = Array.from(new Set(urls));
    if (unique.length === 0) return;

    let cancelled = false;
    let done = 0;
    let failed = 0;
    const queue = [...unique];
    setSync({ done: 0, total: unique.length, failed: 0 });

    // prosimy przeglądarkę o trwały zapis (bez tego stare tablety potrafią czyścić cache przy braku miejsca)
    navigator.storage?.persist?.().catch(() => undefined);

    (async () => {
      const cache = await caches.open(MEDIA_CACHE);
      const worker = async () => {
        while (queue.length && !cancelled) {
          const u = queue.shift()!;
          try {
            if (!(await cache.match(u))) {
              const res = await fetch(u);
              if (!res.ok) throw new Error(String(res.status));
              await cache.put(u, res);
            }
          } catch {
            failed++;
          }
          if (!cancelled) setSync({ done: ++done, total: unique.length, failed });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (cancelled) return;
      // strona i dane muszą przejść przez SW, żeby zostały zapisane (HTML bez tego nie otworzy się offline)
      if ("serviceWorker" in navigator) {
        try {
          await navigator.serviceWorker.ready;
          if (!navigator.serviceWorker.controller) {
            await new Promise<void>((res) => {
              navigator.serviceWorker.addEventListener("controllerchange", () => res(), { once: true });
              setTimeout(res, 4000);
            });
          }
          await fetch(`/api/t/${slug}/gallery`).catch(() => undefined);
          await fetch(window.location.pathname, { headers: { Accept: "text/html" } }).catch(() => undefined);
        } catch {
          /* SW niedostępny */
        }
      }
      if (!cancelled && failed === 0) setTimeout(() => !cancelled && setSync(null), 3500);
    })();
    return () => {
      cancelled = true;
    };
  }, [gallery, slug]);

  // Pełny ekran: wykrycie wsparcia + śledzenie stanu (także gdy użytkownik wyjdzie klawiszem Esc)
  useEffect(() => {
    const el = document.documentElement as FsEl;
    setFsSupported(Boolean(el.requestFullscreen || el.webkitRequestFullscreen));
    const onChange = () => setFullscreen(Boolean(fsElement()));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    onChange();
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (fsElement()) {
        await ((document as FsDoc).exitFullscreen?.() ?? (document as FsDoc).webkitExitFullscreen?.());
      } else {
        const el = document.documentElement as FsEl;
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      /* przeglądarka odmówiła (np. brak gestu użytkownika) – ignorujemy */
    }
  }, []);

  // Skrót klawiszowy F (nie przy wpisywaniu w polach formularza)
  useEffect(() => {
    if (!fsSupported) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fsSupported, toggleFullscreen]);

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

      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 flex items-center gap-2">
        {fsSupported && (
          <button
            aria-label={fullscreen ? "Wyjdź z pełnego ekranu" : "Pełny ekran"}
            title={fullscreen ? "Wyjdź z pełnego ekranu (F)" : "Pełny ekran (F)"}
            onClick={toggleFullscreen}
            className="grid h-12 w-12 place-items-center rounded-full bg-black/60 backdrop-blur"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {fullscreen ? (
                <path d="M9 4v3a2 2 0 0 1-2 2H4M15 4v3a2 2 0 0 0 2 2h3M9 20v-3a2 2 0 0 0-2-2H4M15 20v-3a2 2 0 0 1 2-2h3" />
              ) : (
                <path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3" />
              )}
            </svg>
          </button>
        )}
        <button
          aria-label="Kategorie"
          onClick={() => setDrawer(true)}
          className="flex h-12 items-center gap-2 rounded-full bg-black/60 px-4 backdrop-blur"
        >
          <span className="text-xl">☰</span>
          <span className="max-w-[40vw] truncate">{category?.name ?? artistName}</span>
        </button>
      </div>

      {sync && (
        <div className="pointer-events-none absolute right-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.75rem)] z-30 rounded-full bg-black/60 px-3 py-2 text-xs text-neutral-300">
          {sync.failed < 0
            ? "Offline niedostępny (wymagane HTTPS)"
            : sync.done < sync.total
              ? `Offline: ${sync.done}/${sync.total}`
              : sync.failed > 0
                ? `Offline: nie zapisano ${sync.failed} zdjęć`
                : "✓ Dostępne offline"}
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
