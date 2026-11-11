"use client";

import { useEffect, useState } from "react";
import { inputCls, primaryBtn } from "./ui";
import type { Me } from "@/lib/types";

type Challenge = { challengeId: string; email: string };
type Step =
  | { name: "login" }
  | { name: "register" }
  | { name: "forgot" }
  | ({ name: "code" } & Challenge)
  | ({ name: "reset" } & Challenge);

const RESEND_COOLDOWN = 60;

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

export default function AuthFlow({ onAuth }: { onAuth: (me: Me) => void }) {
  const [step, setStep] = useState<Step>({ name: "login" });
  const [notice, setNotice] = useState("");
  const go = (s: Step, msg = "") => {
    setNotice(msg);
    setStep(s);
  };

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      {notice && <p className="rounded-lg bg-green-950 p-3 text-sm text-green-300">{notice}</p>}
      {(step.name === "login" || step.name === "register") && (
        <CredentialsForm register={step.name === "register"} onSwitch={go} onChallenge={(c) => go({ name: "code", ...c })} />
      )}
      {step.name === "forgot" && <ForgotForm onBack={() => go({ name: "login" })} onChallenge={(c) => go({ name: "reset", ...c })} />}
      {step.name === "code" && <CodeForm challenge={step} onBack={() => go({ name: "login" })} onVerified={onAuth} />}
      {step.name === "reset" && (
        <ResetForm challenge={step} onBack={() => go({ name: "login" })} onDone={() => go({ name: "login" }, "Hasło zostało zmienione. Zaloguj się nowym hasłem.")} />
      )}
    </main>
  );
}

function CredentialsForm({
  register,
  onSwitch,
  onChallenge,
}: {
  register: boolean;
  onSwitch: (s: Step) => void;
  onChallenge: (c: Challenge) => void;
}) {
  const [f, setF] = useState({ name: "", slug: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const r = await post(`/api/auth/${register ? "register" : "login"}`, f);
    setBusy(false);
    if (r.ok) onChallenge(r.data);
    else setError(r.data.error ?? "Błąd");
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <h1 className="text-xl font-semibold">{register ? "Załóż galerię" : "Zaloguj się"}</h1>
      {register && (
        <>
          <input required placeholder="Imię / nazwa studia" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
          <input required placeholder="Adres galerii (np. janedoe)" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} className={inputCls} />
        </>
      )}
      <input required type="email" autoComplete="email" placeholder="E-mail" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={inputCls} />
      <input required type="password" minLength={register ? 8 : undefined} autoComplete={register ? "new-password" : "current-password"} placeholder={register ? "Hasło (min. 8 znaków)" : "Hasło"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className={inputCls} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={busy} className={`${primaryBtn} w-full py-3`}>{busy ? "Wysyłanie kodu…" : register ? "Zarejestruj" : "Zaloguj"}</button>
      {!register && (
        <button type="button" onClick={() => onSwitch({ name: "forgot" })} className="w-full text-sm text-neutral-400 underline">
          Nie pamiętam hasła
        </button>
      )}
      <button type="button" onClick={() => onSwitch({ name: register ? "login" : "register" })} className="w-full text-sm text-neutral-400 underline">
        {register ? "Mam już konto" : "Nie mam konta"}
      </button>
    </form>
  );
}

function ForgotForm({ onBack, onChallenge }: { onBack: () => void; onChallenge: (c: Challenge) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const r = await post("/api/auth/forgot", { email });
    setBusy(false);
    if (r.ok) onChallenge(r.data);
    else setError(r.data.error ?? "Błąd");
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <h1 className="text-xl font-semibold">Przypomnienie hasła</h1>
      <p className="text-sm text-neutral-400">Podaj e-mail konta. Jeśli istnieje, wyślemy na niego kod do zresetowania hasła.</p>
      <input autoFocus required type="email" autoComplete="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={busy} className={`${primaryBtn} w-full py-3`}>{busy ? "Wysyłanie…" : "Wyślij kod"}</button>
      <button type="button" onClick={onBack} className="w-full text-sm text-neutral-400 underline">Wróć do logowania</button>
    </form>
  );
}

/** Pole kodu 6-cyfrowego (klawiatura numeryczna, autouzupełnianie z SMS/maila). */
function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      autoFocus
      required
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      placeholder="000000"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      className={`${inputCls} text-center font-mono text-3xl tracking-[0.5em]`}
      aria-label="Kod weryfikacyjny"
    />
  );
}

/** Przycisk „Wyślij ponownie” z odliczaniem. */
function ResendButton({ challengeId, onError }: { challengeId: string; onError: (m: string) => void }) {
  const [left, setLeft] = useState(RESEND_COOLDOWN);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const resend = async () => {
    onError("");
    const r = await post("/api/auth/resend", { challengeId });
    if (r.ok) {
      setSent(true);
      setLeft(RESEND_COOLDOWN);
    } else onError(r.data.error ?? "Błąd");
  };

  return (
    <button type="button" disabled={left > 0} onClick={resend} className="w-full text-sm text-neutral-400 underline disabled:no-underline disabled:opacity-60">
      {left > 0 ? `Wyślij kod ponownie za ${left} s` : "Wyślij kod ponownie"}
      {sent && left > 0 ? " (wysłano nowy)" : ""}
    </button>
  );
}

function CodeForm({ challenge, onBack, onVerified }: { challenge: Challenge; onBack: () => void; onVerified: (me: Me) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    setBusy(true);
    const r = await post("/api/auth/verify", { challengeId: challenge.challengeId, code });
    setBusy(false);
    if (r.ok) onVerified(r.data);
    else {
      setError(r.data.error ?? "Błąd");
      setCode("");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <h1 className="text-xl font-semibold">Weryfikacja</h1>
      <p className="text-sm text-neutral-400">
        Wysłaliśmy 6-cyfrowy kod na <span className="text-neutral-200">{challenge.email}</span>. Jest ważny 10 minut.
      </p>
      <CodeInput value={code} onChange={setCode} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={busy || code.length !== 6} className={`${primaryBtn} w-full py-3`}>{busy ? "Sprawdzanie…" : "Potwierdź"}</button>
      <ResendButton challengeId={challenge.challengeId} onError={setError} />
      <button type="button" onClick={onBack} className="w-full text-sm text-neutral-400 underline">Wróć</button>
    </form>
  );
}

function ResetForm({ challenge, onBack, onDone }: { challenge: Challenge; onBack: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (pw !== repeat) return setError("Hasła nie są takie same");
    setBusy(true);
    const r = await post("/api/auth/reset", { challengeId: challenge.challengeId, code, newPassword: pw });
    setBusy(false);
    if (r.ok) onDone();
    else setError(r.data.error ?? "Błąd");
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <h1 className="text-xl font-semibold">Ustaw nowe hasło</h1>
      <p className="text-sm text-neutral-400">
        Jeśli konto <span className="text-neutral-200">{challenge.email}</span> istnieje, wysłaliśmy na nie 6-cyfrowy kod.
      </p>
      <CodeInput value={code} onChange={setCode} />
      <input required type="password" minLength={8} autoComplete="new-password" placeholder="Nowe hasło (min. 8 znaków)" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
      <input required type="password" minLength={8} autoComplete="new-password" placeholder="Powtórz nowe hasło" value={repeat} onChange={(e) => setRepeat(e.target.value)} className={inputCls} />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={busy || code.length !== 6} className={`${primaryBtn} w-full py-3`}>{busy ? "Zapisywanie…" : "Zmień hasło"}</button>
      <ResendButton challengeId={challenge.challengeId} onError={setError} />
      <button type="button" onClick={onBack} className="w-full text-sm text-neutral-400 underline">Wróć do logowania</button>
    </form>
  );
}
