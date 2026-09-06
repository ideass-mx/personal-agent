import type { ChartBlock } from "../types";

type ChartProps = { block: ChartBlock };

export function AreaChart({ block }: ChartProps) {
  const values = block.series[0]?.values ?? [];
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const w = 320;
  const h = 120;
  const pad = 8;
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1);
    const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
    return `${x},${y}`;
  });
  const line = pts.join(" ");
  const area = `${pad},${h - pad} ${line} ${w - pad},${h - pad}`;

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={block.title}>
      <defs>
        <linearGradient id={`area-${block.id ?? "a"}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#area-${block.id ?? "a"})`} />
      <polyline
        points={line}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.25"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BarsChart({ block }: ChartProps) {
  const labels = block.labels ?? [];
  const series = block.series;
  const all = series.flatMap((s) => s.values);
  const max = Math.max(...all, 1);
  const groups = labels.length || series[0]?.values.length || 0;
  const w = 340;
  const h = 140;
  const pad = 16;
  const groupW = (w - pad * 2) / Math.max(groups, 1);
  const barW = Math.min(14, (groupW - 8) / Math.max(series.length, 1));

  return (
    <svg className="chart-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={block.title}>
      {series.map((s, si) =>
        s.values.map((v, i) => {
          const bh = ((v / max) * (h - pad * 2));
          const x = pad + i * groupW + si * (barW + 3) + 6;
          const y = h - pad - bh;
          const opacity = 1 - si * 0.25;
          return (
            <rect
              key={`${si}-${i}`}
              x={x}
              y={y}
              width={barW}
              height={bh}
              rx="3"
              fill="var(--accent)"
              opacity={opacity}
            />
          );
        }),
      )}
      {labels.map((label, i) => (
        <text
          key={label}
          x={pad + i * groupW + groupW / 2}
          y={h - 2}
          textAnchor="middle"
          className="chart-label"
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

export function DonutChart({ block }: ChartProps) {
  const values = block.series.map((s) => s.values[0] ?? 0);
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg className="chart-svg donut" viewBox="0 0 120 120" role="img" aria-label={block.title}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--sunken)" strokeWidth="14" />
        {values.map((v, i) => {
          const len = (v / total) * c;
          const el = (
            <circle
              key={i}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="14"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              opacity={1 - i * 0.22}
              transform="rotate(-90 60 60)"
            />
          );
          offset += len;
          return el;
        })}
        <text x="60" y="64" textAnchor="middle" className="donut-center">
          {Math.round((values[0] / total) * 100)}%
        </text>
      </svg>
      <ul className="donut-legend">
        {block.series.map((s, i) => (
          <li key={s.name}>
            <span className="swatch" style={{ opacity: 1 - i * 0.22 }} />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartView({ block }: ChartProps) {
  if (block.kind === "area") return <AreaChart block={block} />;
  if (block.kind === "bars") return <BarsChart block={block} />;
  return <DonutChart block={block} />;
}
