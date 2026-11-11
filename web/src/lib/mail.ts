/**
 * Wysyłka maili przez Resend (REST API, bez dodatkowych zależności).
 * Env: RESEND_API_KEY, MAIL_FROM (np. "Tattoo Gallery <no-reply@twojadomena.pl>").
 * Poza produkcją, bez konfiguracji, treść maila trafia do logów serwera (do testów lokalnych).
 */
export async function sendMail(opts: { to: string; subject: string; text: string; html: string }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!key || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[mail:dev] do: ${opts.to} | ${opts.subject}\n${opts.text}`);
      return;
    }
    throw new Error("Resend nie jest skonfigurowany (RESEND_API_KEY / MAIL_FROM)");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, text: opts.text, html: opts.html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
}

const COPY = {
  LOGIN: { subject: "Kod weryfikacyjny – Tattoo Gallery", lead: "Twój kod weryfikacyjny do logowania:" },
  RESET: { subject: "Reset hasła – Tattoo Gallery", lead: "Twój kod do zresetowania hasła:" },
} as const;

export async function sendCodeMail(to: string, code: string, purpose: keyof typeof COPY, ttlMinutes: number) {
  const { subject, lead } = COPY[purpose];
  const note = `Kod jest ważny ${ttlMinutes} minut. Jeśli to nie Ty, zignoruj tę wiadomość.`;
  await sendMail({
    to,
    subject,
    text: `${lead} ${code}\n\n${note}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px">
      <p>${lead}</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0">${code}</p>
      <p style="color:#666;font-size:13px">${note}</p></div>`,
  });
}
