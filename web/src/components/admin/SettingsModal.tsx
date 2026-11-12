"use client";

import { useState } from "react";
import Modal from "./Modal";
import ProgressBar from "./ProgressBar";
import { api, uploadForm } from "./adminApi";
import { inputCls, primaryBtn, secondaryBtn } from "./ui";
import type { Me } from "@/lib/types";

type Props = { me: Me; onClose: () => void; onMeChange: (me: Me) => void };

const refetchMe = (): Promise<Me> => fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json());

export default function SettingsModal({ me, onClose, onMeChange }: Props) {
  // --- logo ---
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [percent, setPercent] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [logoError, setLogoError] = useState("");

  const uploadLogo = async () => {
    if (!logoFile) return;
    setLogoError("");
    setLogoBusy(true);
    const fd = new FormData();
    fd.set("file", logoFile);
    fd.set("target", "logo");
    const res = await uploadForm(fd, (loaded, total) => {
      setPercent((loaded / total) * 100);
      setProcessing(loaded >= total);
    });
    setLogoBusy(false);
    setProcessing(false);
    if (!res.ok) return setLogoError(res.data?.error ?? `Błąd ${res.status}`);
    setLogoFile(null);
    onMeChange(await refetchMe());
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    const err = await api("/api/auth/logo", "DELETE");
    setLogoBusy(false);
    if (err) return setLogoError(err);
    onMeChange(await refetchMe());
  };

  // --- dane studia ---
  const [name, setName] = useState(me.name);
  const [slug, setSlug] = useState(me.slug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(data.error ?? `Błąd ${res.status}`);
    onMeChange(data);
    setSlug(data.slug);
    setSaved(true);
  };

  const busy = logoBusy || saving;
  const slugChanged = slug.trim().toLowerCase() !== me.slug;

  return (
    <Modal title="Ustawienia studia" onClose={onClose} locked={busy}>
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-400">Logo</h3>
          <div className="grid min-h-28 place-items-center rounded-xl bg-neutral-800 p-3">
            {me.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.logoUrl} alt="Logo studia" className="block h-auto max-h-60 w-auto max-w-full object-contain" />
            ) : (
              <span className="text-sm text-neutral-500">Brak logo</span>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            disabled={logoBusy}
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-4 file:py-2 file:text-neutral-100"
          />
          {logoBusy && logoFile && (
            <ProgressBar percent={percent} indeterminate={processing} label={processing ? "Przetwarzanie…" : "Wysyłanie…"} />
          )}
          {logoError && <p className="text-sm text-red-400">{logoError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={uploadLogo} disabled={!logoFile || logoBusy} className={primaryBtn}>
              {me.logoUrl ? "Zmień logo" : "Wgraj logo"}
            </button>
            {me.logoUrl && (
              <button type="button" onClick={removeLogo} disabled={logoBusy} className={`${secondaryBtn} text-red-400`}>
                Usuń logo
              </button>
            )}
          </div>
        </section>

        <form onSubmit={save} className="space-y-3 border-t border-neutral-800 pt-5">
          <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-400">Dane</h3>
          <label className="block space-y-1">
            <span className="text-sm text-neutral-400">Nazwa studia</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </label>
          <label className="block space-y-1">
            <span className="text-sm text-neutral-400">Adres galerii (slug)</span>
            <input required value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className={inputCls} />
            <span className="block text-xs text-neutral-500">
              /t/{slug || "…"} oraz {slug || "…"}.tattoo.localhost
            </span>
          </label>
          {slugChanged && (
            <p className="rounded-lg bg-amber-950 p-3 text-xs text-amber-300">
              Zmiana adresu unieważnia stary link do galerii. Aplikację zainstalowaną na tabletach (PWA) trzeba
              zainstalować ponownie z nowego adresu.
            </p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {saved && <p className="text-sm text-green-400">Zapisano.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={secondaryBtn}>Zamknij</button>
            <button disabled={busy} className={primaryBtn}>{saving ? "Zapisywanie…" : "Zapisz"}</button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
