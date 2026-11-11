"use client";

import { useState } from "react";
import DataGrid, { IconButton, type Column } from "./DataGrid";
import { ConfirmModal } from "./Modal";
import CategoryFormModal from "./CategoryFormModal";
import { IconDown, IconEdit, IconOpen, IconPlus, IconTrash, IconUp } from "./icons";
import { api, moveItem } from "./adminApi";
import { primaryBtn } from "./ui";
import type { CategoryDTO } from "@/lib/types";
import type { GalleryStore } from "./store";

type ModalState = { type: "create" } | { type: "edit"; cat: CategoryDTO } | { type: "delete"; cat: CategoryDTO } | null;

export default function CategoriesView({ store, onOpen }: { store: GalleryStore; onOpen: (id: string) => void }) {
  const { categories, setCategories, reload } = store;
  const [modal, setModal] = useState<ModalState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);

  const reorder = async (index: number, to: number) => {
    const next = moveItem(categories, index, to);
    setCategories(next);
    setHighlight(next[to].id);
    setError((await api("/api/categories/reorder", "POST", { ids: next.map((c) => c.id) })) ?? "");
    await reload();
  };

  const remove = async (cat: CategoryDTO) => {
    setBusy(true);
    const err = await api(`/api/categories/${cat.id}`, "DELETE");
    setBusy(false);
    if (err) setError(err);
    else {
      setError("");
      setModal(null);
      await reload();
    }
  };

  const columns: Column<CategoryDTO>[] = [
    { key: "pos", header: "#", className: "w-12 text-neutral-500", render: (_c, i) => i + 1 },
    {
      key: "avatar",
      header: "Avatar",
      className: "w-20",
      render: (c) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
      ),
    },
    {
      key: "name",
      header: "Nazwa",
      render: (c) => (
        <button onClick={() => onOpen(c.id)} className="text-left font-medium hover:underline">{c.name}</button>
      ),
    },
    { key: "count", header: "Zdjęcia", className: "w-24", render: (c) => c.artworks.length },
    {
      key: "options",
      header: "Opcje",
      className: "w-56 text-right",
      render: (c, i) => (
        <div className="flex justify-end">
          <IconButton label="Szczegóły (zdjęcia)" onClick={() => onOpen(c.id)}><IconOpen /></IconButton>
          <IconButton label="Edytuj" onClick={() => setModal({ type: "edit", cat: c })}><IconEdit /></IconButton>
          <IconButton label="Przesuń w górę" disabled={i === 0} onClick={() => reorder(i, i - 1)}><IconUp /></IconButton>
          <IconButton label="Przesuń w dół" disabled={i === categories.length - 1} onClick={() => reorder(i, i + 1)}><IconDown /></IconButton>
          <IconButton label="Usuń" danger onClick={() => setModal({ type: "delete", cat: c })}><IconTrash /></IconButton>
        </div>
      ),
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Kategorie</h2>
        <button onClick={() => setModal({ type: "create" })} className={`${primaryBtn} flex items-center gap-2`}>
          <IconPlus /> Dodaj kategorię
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-950 p-3 text-sm text-red-300">{error}</p>}

      <DataGrid
        rows={categories}
        columns={columns}
        getId={(c) => c.id}
        highlightId={highlight}
        empty="Nie masz jeszcze żadnej kategorii. Dodaj pierwszą."
      />

      {modal?.type === "create" && <CategoryFormModal onClose={() => setModal(null)} onSaved={reload} />}
      {modal?.type === "edit" && <CategoryFormModal category={modal.cat} onClose={() => setModal(null)} onSaved={reload} />}
      {modal?.type === "delete" && (
        <ConfirmModal
          title="Usuń kategorię"
          message={`Usunąć „${modal.cat.name}” wraz z ${modal.cat.artworks.length} zdjęciami? Tej operacji nie da się cofnąć.`}
          busy={busy}
          onConfirm={() => remove(modal.cat)}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}
