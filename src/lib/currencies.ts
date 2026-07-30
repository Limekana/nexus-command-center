// The one currency list. Previously this was eight Western/Nordic codes
// duplicated across four files, with a matching symbol map duplicated across
// five more — so a user in India could not record a transaction, set a budget,
// or pick a base currency in rupees, and there was no "other" escape hatch.
//
// It was never a data constraint: the FX source (open.er-api.com, see
// api/fxRates.ts) returns ~160 currencies free and keyless, so the eight-item
// list was purely a UI decision.
//
// The set below is curated rather than "whatever the API returns" so the picker
// stays scannable, and it is chosen to cover where the users actually are
// (ACT-5): India, LATAM, the Transsion cluster in Africa, SE Asia, China and
// the Middle East, on top of the Western currencies that were already here.

export const SUPPORTED_CURRENCIES = [
  // Americas
  'USD', 'CAD', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN',
  // Europe
  'EUR', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'TRY', 'UAH',
  // Asia-Pacific
  'INR', 'CNY', 'JPY', 'HKD', 'TWD', 'KRW', 'SGD', 'MYR', 'THB', 'IDR', 'PHP', 'VND',
  'PKR', 'BDT', 'LKR', 'NPR', 'AUD', 'NZD',
  // Middle East & Africa
  'AED', 'SAR', 'QAR', 'ILS', 'EGP', 'NGN', 'GHS', 'KES', 'TZS', 'UGX', 'ZAR', 'MAD',
] as const;

export type BaseCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** True when `code` is one the app offers. Used to validate persisted settings,
 *  which may hold a code from an older or newer build. */
export function isSupportedCurrency(code: string): code is BaseCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

// Intl derives the symbol for any ISO 4217 code, so there is no map to keep in
// sync as the list grows. Cached per code+locale because formatToParts is
// comparatively expensive and these run inside render paths.
const symbolCache = new Map<string, string>();

/** The narrow symbol for a currency — '₹', '$', 'R$'. Falls back to the code
 *  itself, never to an empty string: the hand-rolled maps this replaces used
 *  `?? ''`, so any currency they did not know about rendered a bare number with
 *  no indication of denomination at all. */
export function currencySymbol(code: string, locale = 'en'): string {
  const key = `${code}:${locale}`;
  const hit = symbolCache.get(key);
  if (hit !== undefined) return hit;
  let sym = code;
  try {
    const part = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    if (part?.value) sym = part.value;
  } catch {
    // Unknown code — keep the code as its own symbol.
  }
  symbolCache.set(key, sym);
  return sym;
}

/** Localised currency name for the picker — "Indian Rupee", "भारतीय रुपया".
 *  Intl.DisplayNames covers every locale the app ships, so the picker reads
 *  naturally in all ten without a single translated string. */
function currencyName(code: string, locale = 'en'): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** A money amount with its currency, placed and spaced per locale.
 *
 *  Replaces nine near-identical hand-rolled helpers that decided placement with
 *  `['kr', 'Fr'].includes(symbol)`. That heuristic was fine for a list of eight
 *  Western currencies and wrong the moment the list widened — Polish złoty,
 *  Czech koruna, Hungarian forint, Romanian leu, Ukrainian hryvnia and
 *  Vietnamese đồng all trail the number, and none of them are 'kr' or 'Fr'.
 *  Intl already knows this for every locale/currency pair.
 *
 *  `signed: false` formats the magnitude only, for callers that render their
 *  own +/− glyph so its colour stays in lockstep with the sign. */
export function formatMoney(
  amount: number,
  currency: string,
  opts: { locale?: string; min?: number; max?: number; signed?: boolean } = {},
): string {
  const { locale = 'en', min = 2, max = 2, signed = true } = opts;
  const value = signed ? amount : Math.abs(amount);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    }).format(value);
  } catch {
    // Unknown code — fall back to a plain number with the code appended.
    const num = value.toLocaleString(locale, {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    });
    return `${num} ${currency.toUpperCase()}`;
  }
}

/** Picker options, sorted by localised name so the list reads alphabetically
 *  in whatever language the user is running. */
export function currencyOptions(locale = 'en'): { code: string; label: string }[] {
  return SUPPORTED_CURRENCIES
    .map((code) => ({ code, label: `${code} — ${currencyName(code, locale)}` }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
}
