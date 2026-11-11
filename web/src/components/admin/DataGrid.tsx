"use client";

import { useEffect, useState, type ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: string;
  className?: string;
  /** index = pozycja wiersza w całej liście (nie na stronie) */
  render: (row: T, index: number) => ReactNode;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  getId: (row: T) => string;
  empty?: ReactNode;
  pageSizeOptions?: number[];
  /** wiersz do podświetlenia; grid przechodzi na jego stronę (np. po zmianie kolejności) */
  highlightId?: string | null;
};

export default function DataGrid<T>({
  rows,
  columns,
  getId,
  empty = "Brak danych",
  pageSizeOptions = [5, 10, 25],
  highlightId,
}: Props<T>) {
  const [pageSize, setPageSize] = useState(pageSizeOptions[1] ?? pageSizeOptions[0]);
  const [page, setPage] = useState(1);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  const visible = rows.slice(start, start + pageSize);

  // po usunięciu ostatniego wiersza strony wróć na istniejącą stronę
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  // przejdź na stronę z podświetlonym wierszem
  useEffect(() => {
    if (!highlightId) return;
    const i = rows.findIndex((r) => getId(r) === highlightId);
    if (i >= 0) setPage(Math.floor(i / pageSize) + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, rows]);

  // okno numerów stron (max 5)
  const first = Math.max(1, Math.min(current - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, i) => first + i);

  const btn = "grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm disabled:opacity-30";

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-neutral-800">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900 text-xs uppercase tracking-wide text-neutral-400">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-medium ${c.className ?? ""}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800 bg-neutral-950">
            {visible.map((row, i) => (
              <tr key={getId(row)} className={getId(row) === highlightId ? "bg-neutral-800/70" : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2 align-middle ${c.className ?? ""}`}>{c.render(row, start + i)}</td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-neutral-500">{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-400">
        <label className="flex items-center gap-2">
          Wierszy:
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="rounded-lg bg-neutral-800 px-2 py-1 text-neutral-100"
          >
            {pageSizeOptions.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>

        <span>
          {rows.length ? `${start + 1}–${Math.min(start + pageSize, rows.length)} z ${rows.length}` : "0"}
        </span>

        <nav className="flex items-center gap-1" aria-label="Paginacja">
          <button className={btn} disabled={current === 1} onClick={() => setPage(1)} aria-label="Pierwsza strona">«</button>
          <button className={btn} disabled={current === 1} onClick={() => setPage(current - 1)} aria-label="Poprzednia strona">‹</button>
          {numbers.map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              aria-current={n === current ? "page" : undefined}
              className={`${btn} ${n === current ? "bg-white font-medium text-black" : "hover:bg-neutral-800"}`}
            >
              {n}
            </button>
          ))}
          <button className={btn} disabled={current === pages} onClick={() => setPage(current + 1)} aria-label="Następna strona">›</button>
          <button className={btn} disabled={current === pages} onClick={() => setPage(pages)} aria-label="Ostatnia strona">»</button>
        </nav>
      </div>
    </div>
  );
}

/** Przycisk-ikona do kolumny „Opcje”. */
export function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-9 w-9 place-items-center rounded-lg hover:bg-neutral-800 active:bg-neutral-700 disabled:pointer-events-none disabled:opacity-30 ${
        danger ? "text-red-400" : "text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}
