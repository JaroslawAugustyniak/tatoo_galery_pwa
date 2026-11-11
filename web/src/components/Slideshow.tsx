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

type Effect = "slide" | "fade" | "tiles" | "strips";
type Mode = Effect | "random";
const MODES: { value: Mode; label: string }[] = [
  { value: "slide", label: "Przesuwanie" },
  { value: "fade", label: "Zanikanie" },
  { value: "tiles", label: "Odwracane kafelki" },
  { value: "strips", label: "Zjeżdżające paski" },
  { value: "random", label: "Losowa" },
];
const EFFECTS: Effect[] = ["slide", "fade", "tiles", "strips"];
const STORAGE_KEY = "gallery-transition";
const OVERLAY_MS = 1100;

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? "-100%" : "100%", opacity: 0 }),
};
const fadeVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
};
// tiles/strips: nowy slajd leży od razu pod spodem, a stary rozpada się nakładką
const instantVariants = {
  enter: { opacity: 1 },
  center: { opacity: 1 },
  exit: { opacity: 1, transition: { duration: 0 } },
};

function SlideFace({ art }: { art: ArtworkDTO }) {
  return (
    <div
      className="absolute inset-0 bg-cover bg-center"
      style={art.blurDataUrl ? { backgroundImage: `url(${art.blurDataUrl})` } : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art.displayUrl} alt="" draggable={false} className="h-full w-full object-contain" />
    </div>
  );
}

/** Nakładka ze starym slajdem pociętym na kawałki, które znikają odsłaniając nowy. */
function BreakupOverlay({ art, effect, w, h, dir }: { art: ArtworkDTO; effect: "tiles" | "strips"; w: number; h: number; dir: number }) {
  if (effect === "strips") {
    const n = 8;
    return (
      <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
        {Array.from({ length: n }, (_, i) => {
          const order = dir > 0 ? i : n - 1 - i;
          const up = i % 2 === 0;
          return (
            <motion.div
              key={i}
              className="absolute inset-0"
              style={{ clipPath: `inset(0 ${(100 * (n - i - 1)) / n}% 0 ${(100 * i) / n}%)` }}
              initial={{ y: 0 }}
              animate={{ y: up ? "-102%" : "102%" }}
              transition={{ duration: 0.7, delay: order * 0.07, ease: [0.65, 0, 0.35, 1] }}
            >
              <SlideFace art={art} />
            </motion.div>
          );
        })}
      </div>
    );
  }

  const cols = w >= h ? 8 : 5;
  const rows = Math.max(3, Math.min(10, Math.round((cols * h) / Math.max(w, 1))));
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const diag = dir > 0 ? c + r : cols - 1 - c + r;
      cells.push(
        <motion.div
          key={`${r}-${c}`}
          className="absolute inset-0"
          style={{
            clipPath: `inset(${(100 * r) / rows}% ${(100 * (cols - c - 1)) / cols}% ${(100 * (rows - r - 1)) / rows}% ${(100 * c) / cols}%)`,
            transformOrigin: `${((c + 0.5) * 100) / cols}% ${((r + 0.5) * 100) / rows}%`,
          }}
          initial={{ rotateY: 0, opacity: 1 }}
          animate={{ rotateY: 90, opacity: 0 }}
          transition={{
            rotateY: { duration: 0.45, delay: diag * 0.05, ease: "easeIn" },
            opacity: { duration: 0.01, delay: diag * 0.05 + 0.44 },
          }}
        >
          <SlideFace art={art} />
        </motion.div>,
      );
    }
  }
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" style={{ perspective: 900 }}>
      {cells}
    </div>
  );
}

export default function Slideshow({ artworks, index, onIndexChange, autoplayMs = 5000 }: Props) {
  const count = artworks.length;
  const art = artworks[index];

  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const [dragX, setDragX] = useState(0);
  const [touching, setTouching] = useState(false);
  const [direction, setDirection] = useState(1);
  const [playing, setPlaying] = useState(true); // autoplay domyślnie włączony, tap pauzuje
  const manualRef = useRef(false); // ręczna nawigacja (swipe/klawisze) => zawsze przesuwanie
  const [mode, setMode] = useState<Mode>("slide");
  const [effect, setEffect] = useState<Effect>("slide"); // efekt aktualnie użyty (dla trybu losowego)
  const [last, setLast] = useState(art);
  const [overlay, setOverlay] = useState<{ art: ArtworkDTO; effect: "tiles" | "strips"; id: number } | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY) as Mode | null;
      if (v && MODES.some((m) => m.value === v)) setMode(v);
    } catch {}
  }, []);
  const changeMode = (m: Mode) => {
    setMode(m);
    if (m !== "random") setEffect(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {}
  };

  // zmiana slajdu: wybór efektu i (dla kafelków/pasków) nakładka ze starym slajdem
  if (art && last && art.id !== last.id) {
    const eff = manualRef.current ? "slide" : mode === "random" ? EFFECTS[Math.floor(Math.random() * EFFECTS.length)] : mode;
    setLast(art);
    setEffect(eff);
    setOverlay(eff === "tiles" || eff === "strips" ? { art: last, effect: eff, id: Date.now() } : null);
  } else if (art && !last) {
    setLast(art);
  }
  useEffect(() => {
    if (!overlay) return;
    const t = setTimeout(() => setOverlay(null), OVERLAY_MS);
    return () => clearTimeout(t);
  }, [overlay]);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const go = useCallback(
    (dir: 1 | -1, manual = false) => {
      if (count < 2) return;
      manualRef.current = manual;
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
      if (e.key === "ArrowRight") go(1, true);
      if (e.key === "ArrowLeft") go(-1, true);
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
            if (Math.abs(mx) > w * 0.2 || (vx > 0.5 && Math.abs(mx) > 30)) go(mx < 0 ? 1 : -1, true);
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
          variants={effect === "slide" ? slideVariants : effect === "fade" ? fadeVariants : instantVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={effect === "fade" ? { duration: 0.7, ease: "easeInOut" } : effect === "slide" ? { type: "spring", stiffness: 300, damping: 34 } : { duration: 0 }}
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

      {overlay && (
        <BreakupOverlay
          key={overlay.id}
          art={overlay.art}
          effect={overlay.effect}
          dir={direction}
          w={box.current?.clientWidth ?? 1}
          h={box.current?.clientHeight ?? 1}
        />
      )}

      {/* nakładka: tytuł + licznik + stan autoplay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <span className="text-lg">{art.title}</span>
        <span className="text-sm text-neutral-300">
          {index + 1} / {count}
        </span>
      </div>

      {count > 1 && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-10 flex -translate-x-1/2 items-center gap-2"
        >
          <button
            aria-label={playing ? "Pauza" : "Odtwarzaj"}
            onClick={() => setPlaying((p) => !p)}
            className="grid h-12 w-12 place-items-center rounded-full bg-black/60 text-lg backdrop-blur"
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <select
            aria-label="Animacja przejścia"
            value={mode}
            onChange={(e) => changeMode(e.target.value as Mode)}
            className="h-12 max-w-[9.5rem] rounded-full bg-black/60 px-3 text-sm text-white backdrop-blur"
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value} className="bg-neutral-900">
                {m.label}
              </option>
            ))}
          </select>
        </div>
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
