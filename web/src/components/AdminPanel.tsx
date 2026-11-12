"use client";

import { useCallback, useEffect, useState } from "react";
import CategoriesView from "./admin/CategoriesView";
import CategoryDetail from "./admin/CategoryDetail";
import SettingsModal from "./admin/SettingsModal";
import PasswordModal from "./admin/PasswordModal";
import { IconKey, IconSettings } from "./admin/icons";
import { IconButton } from "./admin/DataGrid";
import AuthFlow from "./admin/AuthFlow";
import type { CategoryDTO, GalleryDTO, Me } from "@/lib/types";
import type { GalleryStore } from "./admin/store";

export default function AdminPanel() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (me === undefined) return null;
  return me ? <Dashboard me={me} onMeChange={setMe} onLogout={() => setMe(null)} /> : <AuthFlow onAuth={setMe} />;
}

function Dashboard({ me, onMeChange, onLogout }: { me: Me; onMeChange: (me: Me) => void; onLogout: () => void }) {
  const [dialog, setDialog] = useState<"settings" | "password" | null>(null);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/t/${me.slug}/gallery?fresh=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const g: GalleryDTO = await res.json();
      setCategories(g.categories);
    } catch {
      /* brak sieci – zostają poprzednie dane */
    } finally {
      setLoaded(true);
    }
  }, [me.slug]);
  useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);

  const store: GalleryStore = { slug: me.slug, categories, setCategories, reload };

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 pb-16 sm:p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {me.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.logoUrl} alt="" className="h-12 max-w-24 shrink-0 object-contain" />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold">{me.name}</h1>
            <a href={`/t/${me.slug}`} className="text-sm text-neutral-400 underline">Otwórz galerię</a>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton label="Ustawienia studia" onClick={() => setDialog("settings")}><IconSettings /></IconButton>
          <IconButton label="Zmień hasło" onClick={() => setDialog("password")}><IconKey /></IconButton>
          <button
            className="ml-2 text-sm text-neutral-400 underline"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              onLogout();
            }}
          >
            Wyloguj
          </button>
        </div>
      </header>

      {!loaded ? null : categoryId ? (
        <CategoryDetail store={store} categoryId={categoryId} onBack={() => setCategoryId(null)} />
      ) : (
        <CategoriesView store={store} onOpen={setCategoryId} />
      )}

      {dialog === "settings" && <SettingsModal me={me} onClose={() => setDialog(null)} onMeChange={onMeChange} />}
      {dialog === "password" && <PasswordModal onClose={() => setDialog(null)} />}
    </main>
  );
}
