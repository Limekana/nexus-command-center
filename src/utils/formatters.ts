export function formatCurrency(amount: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Local-time YYYY-MM-DD bucket key for a Date. Used as the grouping key
 * across modules so a transaction logged at 23:59 in Europe/Helsinki goes
 * into today's bucket, not tomorrow's (which `toISOString().slice(0,10)`
 * would do in UTC).
 */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('fi-FI', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(iso));
}

export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat('fi-FI', { day: '2-digit', month: 'short' }).format(new Date(iso));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('fi-FI', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

export function formatCacheAge(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)}m old`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m old` : `${h}h old`;
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

export function isOverdue(iso: string): boolean {
  return new Date(iso) < new Date() && !isToday(iso);
}
