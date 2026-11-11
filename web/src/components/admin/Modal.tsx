"use client";

import { useEffect, type ReactNode } from "react";
import { IconClose } from "./icons";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** blokuje zamknięcie (np. w trakcie uploadu) */
  locked?: boolean;
};

export default function Modal({ title, onClose, children, locked = false }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !locked && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [locked, onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={() => !locked && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-neutral-900 p-5 shadow-2xl ring-1 ring-neutral-700"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} disabled={locked} aria-label="Zamknij" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-neutral-800 disabled:opacity-30">
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Usuń",
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} locked={busy}>
      <p className="text-neutral-300">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button onClick={onClose} disabled={busy} className="rounded-lg bg-neutral-800 px-4 py-2">Anuluj</button>
        <button onClick={onConfirm} disabled={busy} className="rounded-lg bg-red-600 px-4 py-2 font-medium disabled:opacity-50">
          {busy ? "Usuwanie…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
