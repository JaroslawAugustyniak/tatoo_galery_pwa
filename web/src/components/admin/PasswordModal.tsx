"use client";

import { useState } from "react";
import Modal from "./Modal";
import { api } from "./adminApi";
import { inputCls, primaryBtn, secondaryBtn } from "./ui";

export default function PasswordModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ currentPassword: "", newPassword: "", repeat: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (f.newPassword !== f.repeat) return setError("Nowe hasła nie są takie same");
    setBusy(true);
    const err = await api("/api/auth/password", "POST", { currentPassword: f.currentPassword, newPassword: f.newPassword });
    setBusy(false);
    if (err) return setError(err);
    setDone(true);
  };

  return (
    <Modal title="Zmiana hasła" onClose={onClose} locked={busy}>
      {done ? (
        <div className="space-y-4">
          <p className="text-green-400">Hasło zostało zmienione.</p>
          <div className="flex justify-end"><button onClick={onClose} className={primaryBtn}>Zamknij</button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input autoFocus required type="password" autoComplete="current-password" placeholder="Aktualne hasło" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} className={inputCls} />
          <input required type="password" autoComplete="new-password" minLength={8} placeholder="Nowe hasło (min. 8 znaków)" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} className={inputCls} />
          <input required type="password" autoComplete="new-password" minLength={8} placeholder="Powtórz nowe hasło" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} className={inputCls} />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={secondaryBtn}>Anuluj</button>
            <button disabled={busy} className={primaryBtn}>{busy ? "Zapisywanie…" : "Zmień hasło"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
