// Inline SVG donut. Renders an arbitrary number of weighted slices around a
// circle, with a hollow center for a label. Custom palette chosen for
// contrast on the dark theme; cycles for >7 slices (acceptable since we
// usually have ≤6 unique sectors/currencies in a personal portfolio).
//
// No legend rendering here — the parent owns layout. We expose the palette
// so the parent can render swatches that match the slice colors.

export interface DonutSlice {
  label: string;
  value: number;
}

interface DonutProps {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerTop?: string;    // big number, e.g. "€12,450"
  centerBottom?: string; // small caption, e.g. "across 6 assets"
}

// Eyeballed palette — primary + 6 distinguishable tones, sequential enough
// to read as "different categories" without clashing on the dark background.
export const DONUT_PALETTE = [
  '#00D4FF', // primary cyan
  '#3FB950', // success green
  '#D29922', // warning amber
  '#A371F7', // violet
  '#F778BA', // pink
  '#FB8500', // orange
  '#7D8590', // muted grey — reserved for "Other"
];

export function colorForIndex(i: number): string {
  return DONUT_PALETTE[i % DONUT_PALETTE.length];
}

export default function DonutChart({
  data,
  size = 140,
  thickness = 22,
  centerTop,
  centerBottom,
}: DonutProps) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total <= 0) {
    // Empty state — render a hollow ring outline so the slot doesn't collapse.
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center text-[10px] text-text-muted"
      >
        no data
      </div>
    );
  }

  const r = size / 2;
  const innerR = r - thickness;
  const cx = r;
  const cy = r;

  // SVG arc rendering: convert each slice's fraction → start/end angle in
  // radians, draw an arc between the two radii. For a single slice (100%)
  // we can't draw a closed path because start==end — fall back to two
  // half-arcs (or just draw a full ring with a filled circle subtracted).
  let angle = -Math.PI / 2; // start at 12 o'clock
  const paths: { d: string; color: string; label: string; value: number }[] = [];

  data.forEach((slice, i) => {
    const frac = slice.value / total;
    const sweep = frac * Math.PI * 2;
    const end = angle + sweep;

    if (frac >= 0.9999) {
      // Single slice owns 100% — use fill-rule trickery with two paths so
      // the donut still renders. Cheap: outer circle filled, inner circle subtracted.
      paths.push({
        d:
          `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} ` +
          `A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z ` +
          `M ${cx - innerR} ${cy} A ${innerR} ${innerR} 0 1 0 ${cx + innerR} ${cy} ` +
          `A ${innerR} ${innerR} 0 1 0 ${cx - innerR} ${cy} Z`,
        color: colorForIndex(i),
        label: slice.label,
        value: slice.value,
      });
    } else {
      const x1 = cx + r * Math.cos(angle);
      const y1 = cy + r * Math.sin(angle);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const xi1 = cx + innerR * Math.cos(end);
      const yi1 = cy + innerR * Math.sin(end);
      const xi2 = cx + innerR * Math.cos(angle);
      const yi2 = cy + innerR * Math.sin(angle);
      const large = sweep > Math.PI ? 1 : 0;
      paths.push({
        d:
          `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} ` +
          `L ${xi1} ${yi1} A ${innerR} ${innerR} 0 ${large} 0 ${xi2} ${yi2} Z`,
        color: colorForIndex(i),
        label: slice.label,
        value: slice.value,
      });
    }
    angle = end;
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {paths.map((p, i) => (
          <path key={`${p.label}-${i}`} d={p.d} fill={p.color} fillRule="evenodd" />
        ))}
      </svg>
      {(centerTop || centerBottom) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          {centerTop && (
            <div className="font-heading font-semibold text-sm leading-tight">{centerTop}</div>
          )}
          {centerBottom && (
            <div className="text-[9px] uppercase tracking-wider text-text-muted mt-0.5">
              {centerBottom}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
