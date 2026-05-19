// Compact market-news feed. Reads from useFinanceStore.marketNews which is
// populated on every portfolio refresh (6h cache). Renders top 5; each is an
// external link that opens in the system browser via target="_blank".

import { useFinanceStore } from '../store/useFinanceStore';

function relativeTime(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function NewsCard() {
  const news = useFinanceStore((s) => s.marketNews);
  if (news.length === 0) return null;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <span className="font-heading font-semibold text-sm">Market News</span>
        <span className="text-[9px] uppercase tracking-wider text-text-muted">
          {news.length} stories
        </span>
      </div>
      <div className="space-y-2">
        {news.slice(0, 5).map((n) => (
          <a
            key={n.id}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block py-1.5 border-b border-border/40 last:border-0 active:bg-surface2/50 rounded-sm"
          >
            <div className="text-xs font-medium leading-snug line-clamp-2">{n.headline}</div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {n.source} · {relativeTime(n.datetime)}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
