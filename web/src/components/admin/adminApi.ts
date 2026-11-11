/** Wywołanie JSON API; zwraca komunikat błędu albo null. */
export async function api(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.ok ? null : ((await res.json().catch(() => ({}))).error ?? `Błąd ${res.status}`);
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const copy = [...arr];
  copy.splice(to, 0, copy.splice(from, 1)[0]);
  return copy;
}

export const thumbOf = (displayUrl: string) => displayUrl.replace("-full.webp", "-thumb.webp");

export type UploadResult = { ok: boolean; status: number; data: { error?: string } | null };

/** POST multipart przez XHR (domyślnie /api/upload) – fetch nie raportuje postępu wysyłania. */
export function uploadForm(
  fd: FormData,
  onProgress: (loaded: number, total: number) => void,
  url = "/api/upload",
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded, e.total);
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, data: { error: "Błąd sieci" } });
    xhr.send(fd);
  });
}
