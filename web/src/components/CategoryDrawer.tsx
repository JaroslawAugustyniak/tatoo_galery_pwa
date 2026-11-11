"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { CategoryDTO } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  artistName: string;
  logoUrl?: string | null;
  categories: CategoryDTO[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export default function CategoryDrawer({ open, onClose, artistName, logoUrl, categories, activeId, onSelect }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            className="fixed inset-y-0 right-0 z-50 flex w-[min(22rem,85vw)] flex-col bg-neutral-950 pt-[env(safe-area-inset-top)] shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.4, right: 0 }}
            onDragEnd={(_, info) => info.offset.x < -80 && onClose()}
          >
            <header className="flex flex-col items-center gap-3 border-b border-neutral-800 p-5 text-center">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" draggable={false} className="max-h-24 max-w-full object-contain" />
              )}
              <span className="text-xl font-semibold">{artistName}</span>
            </header>
            <ul className="flex-1 overflow-y-auto p-3">
              {categories.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => {
                      onSelect(c.id);
                      onClose();
                    }}
                    className={`flex w-full items-center gap-4 rounded-xl p-3 text-left transition-colors ${
                      c.id === activeId ? "bg-neutral-800" : "active:bg-neutral-900"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.avatarUrl}
                      alt=""
                      draggable={false}
                      className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-neutral-700"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg">{c.name}</span>
                      <span className="text-sm text-neutral-500">{c.artworks.length} prac</span>
                    </span>
                  </button>
                </li>
              ))}
              {categories.length === 0 && <li className="p-4 text-neutral-500">Brak kategorii</li>}
            </ul>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
