import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZES = [10, 25, 50, 100] as const;

/**
 * Client-side paging for a list already in memory. Goes back to page 1
 * whenever `resetKey` changes (a new filter or search), and never points
 * past the last page when the list shrinks (e.g. a live update removed rows).
 */
export function usePaged<T>(items: T[], initialSize = 25, resetKey: unknown = null) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(initialSize);
  useEffect(() => setPage(0), [resetKey, size]);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages - 1);
  return {
    pageItems: items.slice(current * size, current * size + size),
    page: current,
    pages,
    size,
    total: items.length,
    setPage,
    setSize,
  };
}

/** Pager bar: "21–40 sur 312", rows-per-page, numbered pages with ellipses. */
export function Pagination({
  page,
  pages,
  total,
  size,
  onPage,
  onSize,
  unit = "lignes",
}: {
  page: number;
  pages: number;
  total: number;
  size: number;
  onPage: (page: number) => void;
  onSize?: (size: number) => void;
  unit?: string;
}) {
  if (total === 0) return null;
  const from = page * size + 1;
  const to = Math.min(total, page * size + size);

  // 1 … 4 5 [6] 7 8 … 20
  const numbers: (number | "…")[] = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 2) numbers.push(i);
    else if (numbers[numbers.length - 1] !== "…") numbers.push("…");
  }

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>
          {from}–{to} sur {total.toLocaleString("fr-FR")} {unit}
        </span>
        {onSize && (
          <label className="flex items-center gap-1.5">
            <span>Par page</span>
            <select value={size} onChange={(e) => onSize(Number(e.target.value))} className="rounded-lg border border-border bg-card px-2 py-1 text-xs">
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button disabled={page === 0} onClick={() => onPage(page - 1)} className="btn-outline px-2 py-1.5" aria-label="Page précédente">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {numbers.map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="px-1">
                …
              </span>
            ) : (
              <button
                key={n}
                onClick={() => onPage(n)}
                aria-current={n === page ? "page" : undefined}
                className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold ${
                  n === page ? "bg-secondary text-white" : "border border-border bg-card hover:bg-muted"
                }`}
              >
                {n + 1}
              </button>
            ),
          )}
          <button disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} className="btn-outline px-2 py-1.5" aria-label="Page suivante">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
