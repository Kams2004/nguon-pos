import { useEffect, useRef, useState } from "react";
import { formatCompact, formatMoney } from "../lib/format";
import type { HourPoint } from "../lib/stats";

export type DailyPoint = { label: string; value: number; count: number };

const H = 220;

// Charts draw at their container's real pixel width (not a scaled
// viewBox), so axis text stays a readable 10px on a phone and doesn't
// balloon on a wide monitor.
function useChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Show at most one x label per ~72px. */
function labelStep(count: number, width: number): number {
  return Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width / 72))));
}
const PAD = { top: 12, right: 12, bottom: 28, left: 44 };

function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

function Axes({ max, W }: { max: number; W: number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <g className="text-[10px]" fill="hsl(var(--muted-foreground))">
      {ticks.map((t) => {
        const y = PAD.top + (H - PAD.top - PAD.bottom) * (1 - t);
        return (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray={t === 0 ? "" : "3 4"} />
            <text x={PAD.left - 8} y={y + 3} textAnchor="end">
              {formatCompact(max * t)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Tooltip({ x, y, point }: { x: number; y: number; point: DailyPoint }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg"
      style={{ left: x, top: y, marginTop: -10 }}
    >
      <p className="font-semibold text-foreground">{point.label}</p>
      <p className="text-muted-foreground">
        <span className="font-bold text-foreground">{formatMoney(point.value)}</span> · {point.count} vente{point.count > 1 ? "s" : ""}
      </p>
    </div>
  );
}

/** Revenue per day, one series — the card title names it, so no legend. */
export function RevenueLineChart({ data }: { data: DailyPoint[] }) {
  const [ref, W] = useChartWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length <= 1 ? plotW / 2 : (plotW * i) / (data.length - 1));
  const y = (v: number) => PAD.top + plotH * (1 - v / max);
  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${PAD.top + plotH} L${x(0)},${PAD.top + plotH} Z`;
  const labelEvery = labelStep(data.length, W);

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" onMouseLeave={() => setHover(null)} role="img" aria-label="Ventes par jour">
        <defs>
          <linearGradient id="rev-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity="0.18" />
            <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <Axes max={max} W={W} />
        {data.map((d, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} className="text-[10px]" fill="hsl(var(--muted-foreground))">
              {d.label}
            </text>
          ) : null,
        )}
        {data.length > 0 && (
          <>
            <path d={area} fill="url(#rev-area)" />
            <path d={line} fill="none" stroke="hsl(var(--secondary))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
        )}
        {data.map((d, i) => (
          <g key={i}>
            <circle
              cx={x(i)}
              cy={y(d.value)}
              r={hover === i ? 5 : 3.5}
              fill="hsl(var(--card))"
              stroke="hsl(var(--secondary))"
              strokeWidth={2}
            />
            {/* Hit target wider than the mark: the full column */}
            <rect
              x={x(i) - plotW / Math.max(1, data.length - 1) / 2}
              y={PAD.top}
              width={plotW / Math.max(1, data.length - 1)}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
      </svg>
      {hover !== null && data[hover] && <Tooltip x={x(hover)} y={y(data[hover].value)} point={data[hover]} />}
    </div>
  );
}

/** Revenue per day as bars — for reports, where each day is a discrete total. */
export function RevenueBarChart({ data }: { data: DailyPoint[] }) {
  const [ref, W] = useChartWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.min(36, Math.max(4, slot - 2 - slot * 0.3));
  const labelEvery = labelStep(data.length, W);

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" onMouseLeave={() => setHover(null)} role="img" aria-label="Ventes par jour">
        <Axes max={max} W={W} />
        {data.map((d, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const h = (d.value / max) * plotH;
          const top = PAD.top + plotH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${cx - barW / 2},${PAD.top + plotH} V${top + r} Q${cx - barW / 2},${top} ${cx - barW / 2 + r},${top} H${cx + barW / 2 - r} Q${cx + barW / 2},${top} ${cx + barW / 2},${top + r} V${PAD.top + plotH} Z`}
                  fill="hsl(var(--secondary))"
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {(i % labelEvery === 0 || i === data.length - 1) && (
                <text x={cx} y={H - 8} textAnchor="middle" className="text-[10px]" fill="hsl(var(--muted-foreground))">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <Tooltip
          x={PAD.left + slot * hover + slot / 2}
          y={PAD.top + plotH - (data[hover].value / max) * plotH}
          point={data[hover]}
        />
      )}
    </div>
  );
}

/** Share-of-total rows (label, thin bar, amount, %) — the mockup's "Répartition" card. */
export function BreakdownList({ rows }: { rows: { key: string; label: string; value: number; count: number; image?: string }[] }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (rows.length === 0) return <p className="px-5 pb-5 text-sm text-muted-foreground">Aucune donnée sur la période.</p>;
  return (
    <ul className="space-y-3 px-5 pb-5">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.value / total) * 100) : 0;
        return (
          <li key={r.key} className="flex items-center gap-3">
            {r.image && <img src={r.image} alt="" className="h-9 w-9 flex-shrink-0 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium text-foreground">{r.label}</span>
                <span className="whitespace-nowrap font-bold text-foreground">{formatMoney(r.value)}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-secondary" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-16 text-right text-[11px] text-muted-foreground">
                  {pct}% · {r.count}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Cumulative revenue through the day: today (solid, brand blue) against
 * yesterday (dashed, grey) on one axis — same unit, so no second scale.
 * Legend + crosshair tooltip; values never colour-only.
 */
export function ProgressionChart({ data }: { data: HourPoint[] }) {
  const [ref, W] = useChartWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => Math.max(d.today ?? 0, d.yesterday))));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (h: number) => PAD.left + (plotW * h) / 23;
  const y = (v: number) => PAD.top + plotH * (1 - v / max);
  const path = (vals: (number | null)[]) =>
    vals
      .map((v, h) => (v === null ? null : `${h === 0 || vals[h - 1] === null ? "M" : "L"}${x(h)},${y(v)}`))
      .filter(Boolean)
      .join(" ");
  const todayPath = path(data.map((d) => d.today));
  const lastToday = [...data].reverse().find((d) => d.today !== null);
  const point = hover !== null ? data[hover] : null;

  return (
    <div ref={ref} className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-4 px-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded bg-secondary" /> Aujourd'hui
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-5 border-t-2 border-dashed border-muted-foreground/60" /> Hier
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" onMouseLeave={() => setHover(null)} role="img" aria-label="Progression des ventes par heure">
        <Axes max={max} W={W} />
        {[0, 6, 12, 18, 23].map((h) => (
          <text key={h} x={x(h)} y={H - 8} textAnchor={h === 0 ? "start" : h === 23 ? "end" : "middle"} className="text-[10px]" fill="hsl(var(--muted-foreground))">
            {h}h
          </text>
        ))}
        <path d={path(data.map((d) => d.yesterday))} fill="none" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.6} strokeWidth={2} strokeDasharray="5 4" />
        <path d={todayPath} fill="none" stroke="hsl(var(--secondary))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {lastToday && (
          <>
            <circle cx={x(lastToday.hour)} cy={y(lastToday.today!)} r={4.5} fill="hsl(var(--card))" stroke="hsl(var(--secondary))" strokeWidth={2} />
            <text x={x(lastToday.hour) + (lastToday.hour > 18 ? -8 : 8)} y={y(lastToday.today!) - 8} textAnchor={lastToday.hour > 18 ? "end" : "start"} className="text-[11px] font-semibold" fill="hsl(var(--foreground))">
              {formatCompact(lastToday.today!)}
            </text>
          </>
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />}
        {data.map((d) => (
          <rect key={d.hour} x={x(d.hour) - plotW / 46} y={PAD.top} width={plotW / 23} height={plotH} fill="transparent" onMouseEnter={() => setHover(d.hour)} />
        ))}
      </svg>
      {point && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(x(point.hour), 90), W - 90), top: 24 }}
        >
          <p className="font-semibold text-foreground">Jusqu'à {point.hour + 1}h</p>
          <p className="text-muted-foreground">
            Aujourd'hui : <span className="font-bold text-foreground">{point.today === null ? "—" : formatMoney(point.today)}</span>
          </p>
          <p className="text-muted-foreground">
            Hier : <span className="font-bold text-foreground">{formatMoney(point.yesterday)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export type ShareRow = { key: string; label: string; value: number; count: number };

const MAX_SLICES = 6;

/**
 * Share of a total (portion chart): donut + legend with value and %. Colour
 * follows the entity via `colorOf` (a ticket type's own colour, a fixed
 * colour per payment method…), never its rank. Beyond 6 slices the rest
 * folds into a grey "Autres".
 */
export function DonutChart({
  rows,
  colorOf,
  centerLabel,
  formatValue = formatMoney,
  countUnit = "ventes",
}: {
  rows: ShareRow[];
  colorOf: (key: string, index: number) => string;
  centerLabel: string;
  formatValue?: (v: number) => string;
  countUnit?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, MAX_SLICES);
  const tail = sorted.slice(MAX_SLICES);
  const slices = tail.length
    ? [...head, { key: "__other", label: `Autres (${tail.length})`, value: tail.reduce((s, r) => s + r.value, 0), count: tail.reduce((s, r) => s + r.count, 0) }]
    : head;
  const total = slices.reduce((s, r) => s + r.value, 0);
  if (total <= 0) return <p className="px-5 pb-5 text-sm text-muted-foreground">Aucune donnée sur la période.</p>;

  const R = 70;
  const r = 46;
  const C = 90;
  const color = (key: string, i: number) => (key === "__other" ? "hsl(var(--muted-foreground) / 0.45)" : colorOf(key, i));
  let angle = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const sweep = (s.value / total) * Math.PI * 2;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (rad: number, a: number) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    // A single 100% slice can't be drawn as one arc: two half-arcs instead.
    const d =
      slices.length === 1
        ? `M${p(R, -Math.PI / 2)} A${R},${R} 0 1 1 ${p(R, Math.PI / 2)} A${R},${R} 0 1 1 ${p(R, -Math.PI / 2)} M${p(r, -Math.PI / 2)} A${r},${r} 0 1 0 ${p(r, Math.PI / 2)} A${r},${r} 0 1 0 ${p(r, -Math.PI / 2)} Z`
        : `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${large} 0 ${p(r, a0)} Z`;
    return { ...s, d, fill: color(s.key, i) };
  });
  const focus = slices.find((s) => s.key === hover);

  return (
    <div className="flex flex-col items-center gap-4 px-5 pb-5">
      <svg viewBox="0 0 180 180" className="h-44 w-44 flex-shrink-0" role="img" aria-label={centerLabel}>
        {arcs.map((a) => (
          <path
            key={a.key}
            d={a.d}
            fill={a.fill}
            fillRule="evenodd"
            stroke="hsl(var(--card))"
            strokeWidth={2}
            opacity={hover && hover !== a.key ? 0.4 : 1}
            onMouseEnter={() => setHover(a.key)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={C} y={C - 4} textAnchor="middle" className="text-[13px] font-bold" fill="hsl(var(--foreground))">
          {focus ? `${Math.round((focus.value / total) * 100)}%` : formatCompact(total)}
        </text>
        <text x={C} y={C + 12} textAnchor="middle" className="text-[9px]" fill="hsl(var(--muted-foreground))">
          {focus ? focus.label.slice(0, 18) : centerLabel}
        </text>
      </svg>
      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {arcs.map((a) => (
          <li
            key={a.key}
            onMouseEnter={() => setHover(a.key)}
            onMouseLeave={() => setHover(null)}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${hover === a.key ? "bg-muted" : ""}`}
          >
            <span className="h-3 w-3 flex-shrink-0 rounded-sm" style={{ backgroundColor: a.fill }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground" title={a.label}>
                {a.label}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {a.count} {a.count > 1 ? countUnit : countUnit.replace(/s$/, "")}
              </span>
            </span>
            <span className="whitespace-nowrap text-right font-semibold text-foreground">{formatValue(a.value)}</span>
            <span className="w-10 text-right text-xs font-semibold text-muted-foreground">{Math.round((a.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type HistogramBin = { label: string; count: number; detail?: string };

/**
 * Distribution: adjacent bins (2px surface gap), count on one axis. For
 * "how many sales fell in each bucket" — hours of the day, amount ranges.
 */
export function Histogram({ bins, unit = "ventes", labelEvery = 1 }: { bins: HistogramBin[]; unit?: string; labelEvery?: number }) {
  const [ref, W] = useChartWidth();
  const [hover, setHover] = useState<number | null>(null);
  // Counts are whole numbers: a top that's a multiple of 4 keeps every gridline whole.
  const max = Math.max(4, Math.ceil(Math.max(0, ...bins.map((b) => b.count)) / 4) * 4);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, bins.length);
  const step = Math.max(labelEvery, Math.ceil(bins.length / Math.max(2, Math.floor(W / 48))));
  const point = hover !== null ? bins[hover] : null;

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" onMouseLeave={() => setHover(null)} role="img" aria-label="Histogramme">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD.top + plotH * (1 - t);
          return (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray={t === 0 ? "" : "3 4"} />
              <text x={PAD.left - 8} y={y + 3} textAnchor="end" className="text-[10px]" fill="hsl(var(--muted-foreground))">
                {Math.round(max * t)}
              </text>
            </g>
          );
        })}
        {bins.map((b, i) => {
          const h = (b.count / max) * plotH;
          const x = PAD.left + slot * i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={x} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {h > 0 && (
                <rect
                  x={x + 1}
                  y={PAD.top + plotH - h}
                  width={Math.max(1, slot - 2)}
                  height={h}
                  rx={2}
                  fill="hsl(var(--secondary))"
                  opacity={hover === null || hover === i ? 0.9 : 0.45}
                />
              )}
              {i % step === 0 && (
                <text x={x + slot / 2} y={H - 8} textAnchor="middle" className="text-[10px]" fill="hsl(var(--muted-foreground))">
                  {b.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {point && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(PAD.left + slot * hover! + slot / 2, 80), W - 80), top: 8 }}
        >
          <p className="font-semibold text-foreground">{point.label}</p>
          <p className="text-muted-foreground">
            <span className="font-bold text-foreground">{point.count}</span> {unit}
            {point.detail ? ` · ${point.detail}` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
