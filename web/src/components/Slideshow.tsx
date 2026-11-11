"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGesture } from "@use-gesture/react";
import type { ArtworkDTO } from "@/lib/types";

type Props = {
  artworks: ArtworkDTO[];
  index: number;
  onIndexChange: (index: number) => void;
  autoplayMs?: number;
};

const MAX_SCALE = 5;
const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
};

export default function Slideshow({ artworks, index, onIndexChange, autoplayMs = 5000 }: Props) {
  const count = artworks.length;
  const art = artworks[index];

  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const [dragX, setDragX] = useState(0);
  const [touching, setTouching] = useState(false);
  const [direction, setDirection] = useState(1);
  const [playing, setPlaying] = useState(true); // autoplay domyślnie włączony, tap pauzuje
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const go = useCallback(
    (dir: 1 | -1) => {
      if (count < 2) return;
      setDirection(dir);
      onIndexChange((index + dir + count) % count);
    },
    [count, index, onIndexChange],
  );

  // nowy slajd => reset zoomu
  useEffect(() => {
    setZoom({ scale: 1, x: 0, y: 0 });
    setDragX(0);
  }, [art?.id]);

  // autoplay; tap pauzuje/wznawia, zoom wstrzymuje
  useEffect(() => {
    if (!playing || zoom.scale > 1 || count < 2) return;
    const t = setTimeout(() => go(1), autoplayMs);
    return () => clearTimeout(t);
  }, [playing, zoom.scale, count, go, autoplayMs, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  const bind = useGesture(
    {
      onPinch: ({ offset: [s], first, last }) => {
        if (first) setTouching(true);
        const scale = Math.min(MAX_SCALE, Math.max(1, s));
        setZoom((z) => (scale <= 1.02 ? { scale: 1, x: 0, y: 0 } : { ...z, scale }));
        if (last) setTouching(false);
      },
      onDrag: ({ offset: [ox, oy], movement: [mx], velocity: [vx], first, last, tap, pinching, cancel }) => {
        if (pinching) return cancel();
        if (tap) return setPlaying((p) => !p);
        if (first) setTouching(true);
        const z = zoomRef.current;
        const w = box.current?.clientWidth ?? 1;
        const h = box.current?.clientHeight ?? 1;

        if (z.scale > 1) {
          // przesuwanie powiększonego obrazu (ograniczone do jego krawędzi)
          const maxX = ((z.scale - 1) * w) / 2;
          const maxY = ((z.scale - 1) * h) / 2;
          setZoom({ scale: z.scale, x: Math.max(-maxX, Math.min(maxX, ox)), y: Math.max(-maxY, Math.min(maxY, oy)) });
        } else {
          // swipe między slajdami
          setDragX(mx);
          if (last) {
            if (Math.abs(mx) > w * 0.2 || (vx > 0.5 && Math.abs(mx) > 30)) go(mx < 0 ? 1 : -1);
            setDragX(0);
          }
        }
        if (last) setTouching(false);
      },
    },
    {
      drag: { filterTaps: true, from: () => [zoomRef.current.x, zoomRef.current.y] },
      pinch: { scaleBounds: { min: 1, max: MAX_SCALE }, from: () => [zoomRef.current.scale, 0], rubberband: true },
      eventOptions: { passive: false },
    },
  );

  if (!art) {
    return <div className="grid h-full place-items-center text-neutral-500">Brak prac w tej kategorii</div>;
  }

  return (
    <div ref={box} {...bind()} className="relative h-full w-full touch-none select-none overflow-hidden bg-black">
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={art.id}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: "spring", stiffness: 300, damping: 34 }}
          className="absolute inset-0 bg-cover bg-center"
          style={art.blurDataUrl ? { backgroundImage: `url(${art.blurDataUrl})` } : undefined}
        >
          <motion.img
            src={art.displayUrl}
            alt={art.title ?? ""}
            draggable={false}
            className="h-full w-full object-contain"
            animate={{ scale: zoom.scale, x: zoom.x + dragX, y: zoom.y }}
            transition={touching ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 30 }}
          />
        </motion.div>
      </AnimatePresence>

      {/* nakładka: tytuł + licznik + stan autoplay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <span className="text-lg">{art.title}</span>
        <span className="text-sm text-neutral-300">
          {index + 1} / {count}
        </span>
      </div>

      {count > 1 && (
        <button
          aria-label={playing ? "Pauza" : "Odtwarzaj"}
          onClick={() => setPlaying((p) => !p)}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-10 grid h-12 w-12 -translate-x-1/2 place-items-center rounded-full bg-black/60 text-lg backdrop-blur"
        >
          {playing ? "❚❚" : "▶"}
        </button>
      )}

      {zoom.scale > 1 && (
        <button
          onClick={() => setZoom({ scale: 1, x: 0, y: 0 })}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute right-4 top-16 rounded-full bg-black/60 px-4 py-2 text-sm"
        >
          Reset zoomu
        </button>
      )}
    </div>
  );
}
