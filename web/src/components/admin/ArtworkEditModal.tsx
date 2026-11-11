"use client";

import { useEffect, useState } from "react";
import ProgressBar from "./ProgressBar";
import Modal from "./Modal";
import { api, uploadForm } from "./adminApi";
import { inputCls, primaryBtn, secondaryBtn } from "./ui";
import type { ArtworkDTO, CategoryDTO } from "@/lib/types";

type Props = {
  artwork: ArtworkDTO;
  categoryId: string;
  categories: CategoryDTO[];
  onClose: () => void;
  onSaved: () => void;
};

export default function ArtworkEditModal({ artwork, categoryId, categories, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(artwork.title ?? "");
  const [target, setTarget] = useState(categoryId);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // podgląd wybranego pliku (zwalniany przy zmianie/zamknięciu)
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    if (file) {
      const fd = new FormData();
      fd.set("file", file);
      const up = await uploadForm(
        fd,
        (loaded, total) => {
          setPercent((loaded / total) * 100);
          setProcessing(loaded >= total);
        },
        `/api/artworks/${artwork.id}/image`,
      );
      setProcessing(false);
      if (!up.ok) {
        setBusy(false);
        return setError(up.data?.error ?? `Błąd ${up.status}`);
      }
    }

    const err = await api(`/api/artworks/${artwork.id}`, "PATCH", { title, ...(target !== categoryId && { categoryId: target }) });
    setBusy(false);
    if (err) return setError(err);
    onSaved();
    onClose();
  };

  return (
    <Modal title="Edytuj zdjęcie" onClose={onClose} locked={busy}>
      <form onSubmit={submit} className="space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview ?? artwork.displayUrl} alt="" className="mx-auto max-h-56 rounded-lg object-contain" />
        <label className="block space-y-1">
          <span className="text-sm text-neutral-400">Zmień obraz (opcjonalnie)</span>
          <input
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-4 file:py-2 file:text-neutral-100"
          />
          {file && <span className="text-xs text-neutral-500">Nowy obraz zastąpi obecny po kliknięciu „Zapisz”.</span>}
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-neutral-400">Nazwa</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Bez nazwy" className={inputCls} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm text-neutral-400">Kategoria</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {target !== categoryId && <span className="text-xs text-neutral-500">Zdjęcie trafi na koniec wybranej kategorii.</span>}
        </label>
        {busy && file && (
          <ProgressBar percent={percent} indeterminate={processing} label={processing ? "Przetwarzanie obrazu…" : "Wysyłanie…"} />
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={secondaryBtn}>Anuluj</button>
          <button disabled={busy} className={primaryBtn}>{busy ? "Zapisywanie…" : "Zapisz"}</button>
        </div>
      </form>
    </Modal>
  );
}
