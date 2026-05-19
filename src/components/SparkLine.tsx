// Tiny inline SVG line for 7-day price history. Auto-scales y to the visible
// data so a stable coin's micro-wiggle reads as clearly as a volatile crypto's
// pump. Tone follows trend: green when up vs first point, red when down.
//
// Width is fluid (100%) so the parent decides the size; we only set height.
// Stroke is 1.5px which renders crisply at the typical 60-80px width without
// needing a viewBox-to-device-pixel math dance.

interface SparkLineProps {
  data: number[];
  height?: number;
  trend?: 'up' | 'down' | 'flat';
  className?: string;
}

export default function SparkLine({ data, height = 24, trend, className }: SparkLineProps) {
  if (!data || data.length < 2) return <div style={{ height }} className={className} />;

  // viewBox is normalized to 100×height so we don't need to know the actual
  // px width — SVG scales the path for us.
  const W = 100;
  const H = height;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1; // avoid /0 on totally flat series

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    // Inverted y (SVG 0=top); pad 1px top/bottom so the line isn't clipped.
    const y = H - 1 - ((v - min) / span) * (H - 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const inferredTrend: 'up' | 'down' | 'flat' =
    trend ?? (data[data.length - 1] > data[0] ? 'up' : data[data.length - 1] < data[0] ? 'down' : 'flat');
  // Hardcoded — mirrors tailwind.config.js (success / danger / text-muted).
  const stroke =
    inferredTrend === 'up' ? '#3FB950' :
    inferredTrend === 'down' ? '#F85149' :
    '#7D8590';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height={H}
      className={className}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points.join(' ')}
      />
    </svg>
  );
}
