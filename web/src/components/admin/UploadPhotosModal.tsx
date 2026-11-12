"use client";

import { useState } from "react";
import Modal from "./Modal";
import ProgressBar from "./ProgressBar";
import { IconCheck, IconClose } from "./icons";
import { uploadForm } from "./adminApi";
import { primaryBtn, secondaryBtn } from "./ui";

const MAX_BYTES = 30 * 1024 * 1024;

type Status = { state: "pending" | "uploading" | "done" | "error"; error?: string };

export default function UploadPhotosModal({
  categoryId,
  categoryName,
  onClose,
  onUploaded,
}: {
  categoryId: string;
  categoryName: string;
  onClose: () => void;
  onUploaded: () => void | Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [sentBytes, setSentBytes] = useState(0); // bajty zakończonych plików + postęp bieżącego
  const [processing, setProcessing] = useState(false);

  const totalBytes = files.reduce((s, f) => s + f.size, 0) || 1;
  const doneCount = status.filter((s) => s.state === "done" || s.state === "error").length;
  const okCount = status.filter((s) => s.state === "done").length;

  const start = async () => {
    setRunning(true);
    setStatus(files.map(() => ({ state: "pending" })));
    let completed = 0;

    for (const [i, file] of files.entries()) {
      const set = (s: Status) => setStatus((all) => all.map((x, j) => (j === i ? s : x)));
      if (!file.type.startsWith("image/") || file.size > MAX_BYTES) {
        set({ state: "error", error: file.size > MAX_BYTES ? "Plik większy niż 30 MB" : "To nie jest obraz" });
        completed += file.size;
        setSentBytes(completed);
        continue;
      }
      set({ state: "uploading" });
      setProcessing(false);

      // tytuł celowo pomijamy – nazwy dodaje się w edycji
      const fd = new FormData();
      fd.set("file", file);
      fd.set("target", "artwork");
      fd.set("categoryId", categoryId);
      const res = await uploadForm(fd, (loaded, total) => {
        setSentBytes(completed + (loaded / total) * file.size);
        setProcessing(loaded >= total);
      });
      completed += file.size;
      setSentBytes(completed);
      set(res.ok ? { state: "done" } : { state: "error", error: res.data?.error ?? `Błąd ${res.status}` });
      if (res.status === 401) break;
    }

    setProcessing(false);
    setRunning(false);
    await onUploaded();
    setFinished(true);
  };

  const percent = (sentBytes / totalBytes) * 100;

  return (
    <Modal title={`Dodaj zdjęcia – ${categoryName}`} onClose={onClose} locked={running}>
      <div className="space-y-4">
        {!running && !finished && (
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-neutral-800 file:px-4 file:py-2 file:text-neutral-100"
          />
        )}

        {(running || finished) && (
          <ProgressBar
            percent={finished ? 100 : percent}
            indeterminate={running && processing && percent >= 99.9}
            label={
              finished
                ? `Gotowe: ${okCount} z ${files.length}`
                : processing
                  ? `Przetwarzanie ${Math.min(doneCount + 1, files.length)} z ${files.length}…`
                  : `Wysyłanie ${Math.min(doneCount + 1, files.length)} z ${files.length}…`
            }
          />
        )}

        {files.length > 0 && (
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {files.map((f, i) => {
              const s = status[i];
              return (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-3 rounded-lg bg-neutral-800 px-3 py-2">
                  <span className="min-w-0 truncate">{f.name}</span>
                  <span className="shrink-0 text-xs text-neutral-400">
                    {!s && `${(f.size / 1048576).toFixed(1)} MB`}
                    {s?.state === "pending" && "oczekuje"}
                    {s?.state === "uploading" && "w toku…"}
                    {s?.state === "done" && <span className="text-green-400"><IconCheck /></span>}
                    {s?.state === "error" && (
                      <span className="flex items-center gap-1 text-red-400"><IconClose />{s.error}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          {finished ? (
            <button onClick={onClose} className={primaryBtn}>Zamknij</button>
          ) : (
            <>
              <button onClick={onClose} disabled={running} className={secondaryBtn}>Anuluj</button>
              <button onClick={start} disabled={running || files.length === 0} className={primaryBtn}>
                {running ? "Wgrywanie…" : `Wgraj${files.length ? ` (${files.length})` : ""}`}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
