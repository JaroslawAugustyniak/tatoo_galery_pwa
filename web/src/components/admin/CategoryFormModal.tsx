"use client";

import { useEffect, useState } from "react";
import Modal from "./Modal";
import ProgressBar from "./ProgressBar";
import { api, uploadForm } from "./adminApi";
import { inputCls, primaryBtn, secondaryBtn } from "./ui";
import type { CategoryDTO } from "@/lib/types";

type Props = {
  /** brak = tworzenie nowej kategorii (nazwa + plik avatara), jest = edycja nazwy */
  category?: CategoryDTO;
  onClose: () => void;
  onSaved: () => void;
};

export default function CategoryFormModal({ category, onClose, onSaved }: Props) {
  const [name, setName] = useState(category?.name ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  // podgląd wybranego pliku (zwalniany przy zmianie/zamknięciu)
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onProgress = (loaded: number, total: number) => {
    setPercent((loaded / total) * 100);
    setProcessing(loaded >= total);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    if (category) {
      if (file) {
        const fd = new FormData();
        fd.set("file", file);
        const up = await uploadForm(fd, onProgress, `/api/categories/${category.id}/image`);
        setProcessing(false);
        if (!up.ok) {
          setBusy(false);
          return setError(up.data?.error ?? `Błąd ${up.status}`);
        }
      }
      const err = await api(`/api/categories/${category.id}`, "PATCH", { name });
      setBusy(false);
      if (err) return setError(err);
      onSaved();
      return onClose();
    }

    const fd = new FormData();
    fd.set("file", file!);
    fd.set("target", "category");
    fd.set("name", name);
    const res = await uploadForm(fd, onProgress);
    setBusy(false);
    setProcessing(false);
    if (!res.ok) return setError(res.data?.error ?? `Błąd ${res.status}`);
    onSaved();
    onClose();
  };

  return (
    <Modal title={category ? "Edytuj kategorię" : "Nowa kategoria"} onClose={onClose} locked={busy}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm text-neutral-400">Nazwa</span>
          <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </label>

        <div className="space-y-2">
          <span className="text-sm text-neutral-400">
            {category ? "Zdjęcie kategorii (okrągły avatar)" : "Zdjęcie na avatar (okrągła miniatura)"}
          </span>
          {(category || preview) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview ?? category?.avatarUrl}
              alt=""
              className="mx-auto h-28 w-28 rounded-full object-cover ring-2 ring-neutral-700"
            />
          )}
          <input
            required={!category}
            type="file"
            accept="image/*"
            disabled={busy}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-4 file:py-2 file:text-neutral-100"
          />
          {category && file && <span className="block text-xs text-neutral-500">Nowe zdjęcie zastąpi obecne po kliknięciu „Zapisz”.</span>}
        </div>

        {busy && file && (
          <ProgressBar percent={percent} indeterminate={processing} label={processing ? "Przetwarzanie obrazu…" : "Wysyłanie…"} />
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={secondaryBtn}>Anuluj</button>
          <button disabled={busy || !name.trim()} className={primaryBtn}>{busy ? "Zapisywanie…" : "Zapisz"}</button>
        </div>
      </form>
    </Modal>
  );
}
