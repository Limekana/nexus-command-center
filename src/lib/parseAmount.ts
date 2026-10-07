// Amount parsing, shared by the CSV importer and the quick-add overlay.
//
// v1.17 (limecore#12): moved out of csvImport.ts unchanged. Quick add is in
// the startup chunk, and importing this one function from csvImport pulled
// the whole importer (~14 KiB) in with it.

export type DecimalSeparator = '.' | ',';

const MINUS_CHARS = /[−–—]/g; // unicode minus, en dash, em dash

/**
 * Parse one amount cell into a signed number, or null when the cell holds no
 * usable figure.
 *
 * Handles the forms that turn up in real exports: currency symbols and codes
 * either side, thousands separators (`.`, `,`, space, non-breaking space,
 * apostrophe — Swiss files use `1'234.56`), a trailing minus rather than a
 * leading one, and accounting parentheses for negatives.
 */
export function parseAmount(raw: string, decimal: DecimalSeparator): number | null {
  let s = (raw ?? '').trim().replace(MINUS_CHARS, '-');
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1).trim();
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trim();
  }
  if (s.startsWith('+')) s = s.slice(1).trim();

  // Drop currency symbols/codes and grouping characters, keeping only digits
  // and the two possible separators.
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;

  const thousands = decimal === '.' ? ',' : '.';
  s = s.split(thousands).join('');
  if (decimal === ',') s = s.replace(',', '.');
  // Any remaining extra separators mean this was never a number.
  if ((s.match(/\./g)?.length ?? 0) > 1) return null;
  if (!/\d/.test(s)) return null;

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}
