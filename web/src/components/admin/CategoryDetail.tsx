"use client";

import { useEffect, useState } from "react";
import DataGrid, { IconButton, type Column } from "./DataGrid";
import { ConfirmModal } from "./Modal";
import ArtworkEditModal from "./ArtworkEditModal";
import UploadPhotosModal from "./UploadPhotosModal";
import { IconBack, IconDown, IconEdit, IconPlus, IconTrash, IconUp } from "./icons";
import { api, moveItem, thumbOf } from "./adminApi";
import { primaryBtn, secondaryBtn } from "./ui";
import type { ArtworkDTO } from "@/lib/types";
import type { GalleryStore } from "./store";

type ModalState = { type: "upload" } | { type: "edit"; art: ArtworkDTO } | { type: "delete"; art: ArtworkDTO } | null;

export default function CategoryDetail({ store, categoryId, onBack }: { store: GalleryStore; categoryId: string; onBack: () => void }) {
  const { categories, setCategories, reload } = store;
  const category = categories.find((c) => c.id === categoryId);
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);

  // kategoria usunięta/nieistniejąca => wróć do listy
  const missing = !category;
  useEffect(() => {
    if (missing) onBack();
  }, [missing, onBack]);

  if (!category) return null;
  const artworks = category.artworks;

  const reorder = async (index: number, to: number) => {
    const next = moveItem(artworks, index, to);
    setCategories((cs) => cs.map((c) => (c.id === categoryId ? { ...c, artworks: next } : c)));
    setHighlight(next[to].id);
    setError((await api("/api/artworks/reorder", "POST", { categoryId, ids: next.map((a) => a.id) })) ?? "");
    await reload();
  };

  const remove = async (art: ArtworkDTO) => {
    setBusy(true);
    const err = await api(`/api/artworks/${art.id}`, "DELETE");
    setBusy(false);
    if (err) setError(err);
    else {
      setError("");
      setModal(null);
      await reload();
    }
  };

  const columns: Column<ArtworkDTO>[] = [
    { key: "pos", header: "#", className: "w-12 text-neutral-500", render: (_a, i) => i + 1 },
    {
      key: "thumb",
      header: "Podgląd",
      className: "w-24",
      render: (a) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbOf(a.displayUrl)} alt="" className="h-14 w-14 rounded-lg object-cover" />
      ),
    },
    {
      key: "title",
      header: "Nazwa",
      render: (a) => (a.title ? a.title : <span className="text-neutral-500">Bez nazwy</span>),
    },
    {
      key: "options",
      header: "Opcje",
      className: "w-48 text-right",
      render: (a, i) => (
        <div className="flex justify-end">
          <IconButton label="Edytuj" onClick={() => setModal({ type: "edit", art: a })}><IconEdit /></IconButton>
          <IconButton label="Przesuń w górę" disabled={i === 0} onClick={() => reorder(i, i - 1)}><IconUp /></IconButton>
          <IconButton label="Przesuń w dół" disabled={i === artworks.length - 1} onClick={() => reorder(i, i + 1)}><IconDown /></IconButton>
          <IconButton label="Usuń" danger onClick={() => setModal({ type: "delete", art: a })}><IconTrash /></IconButton>
        </div>
      ),
    },
  ];

  return (
    <section className="space-y-4">
      <button onClick={onBack} className={`${secondaryBtn} flex items-center gap-1 !px-3`}>
        <IconBack /> Kategorie
      </button>

      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={category.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
          <h2 className="truncate text-xl font-semibold">{category.name}</h2>
        </div>
        <button onClick={() => setModal({ type: "upload" })} className={`${primaryBtn} flex shrink-0 items-center gap-2`}>
          <IconPlus /> Dodaj zdjęcia
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}

      <DataGrid rows={artworks} columns={columns} getId={(a) => a.id} highlightId={highlight} empty="Brak zdjęć w tej kategorii." />

      {modal?.type === "upload" && (
        <UploadPhotosModal categoryId={categoryId} categoryName={category.name} onClose={() => setModal(null)} onUploaded={reload} />
      )}
      {modal?.type === "edit" && (
        <ArtworkEditModal artwork={modal.art} categoryId={categoryId} categories={categories} onClose={() => setModal(null)} onSaved={reload} />
      )}
      {modal?.type === "delete" && (
        <ConfirmModal
          title="Usuń zdjęcie"
          message={`Usunąć „${modal.art.title ?? "zdjęcie bez nazwy"}”? Tej operacji nie da się cofnąć.`}
          busy={busy}
          onConfirm={() => remove(modal.art)}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}
