/**
 * Money formatting. Amounts are integers in MINOR units (paise/cents) everywhere in the app —
 * see root AGENTS.md → Conventions → Money.
 */
const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', AED: 'AED ' };
const LOCALES: Record<string, string> = { INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB' };

export const currencySymbol = (currency: string) => SYMBOLS[currency] ?? `${currency} `;

function groupDigits(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(LOCALES[currency] ?? 'en-US', { maximumFractionDigits: 0 }).format(value);
  } catch {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}

export type MoneyParts = { sign: '' | '-' | '+'; symbol: string; whole: string; fraction: string };

/** Splits an amount so the UI can render the decimals muted: ₹1,24,560 + .40 */
export function moneyParts(minor: number, currency = 'INR', { showPlus = false } = {}): MoneyParts {
  const abs = Math.abs(Math.round(minor));
  return {
    sign: minor < 0 ? '-' : showPlus && minor > 0 ? '+' : '',
    symbol: currencySymbol(currency),
    whole: groupDigits(Math.floor(abs / 100), currency),
    fraction: `.${String(abs % 100).padStart(2, '0')}`,
  };
}

export function formatMoney(minor: number, currency = 'INR', opts?: { showPlus?: boolean; decimals?: boolean }) {
  const p = moneyParts(minor, currency, opts);
  return `${p.sign}${p.symbol}${p.whole}${opts?.decimals === false ? '' : p.fraction}`;
}

/** 1520000 → "₹15.2k" for chart labels. */
export function formatCompact(minor: number, currency = 'INR') {
  const v = minor / 100;
  const s = currencySymbol(currency);
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (currency === 'INR' && Math.abs(v) >= 100000) return `${s}${trim(v / 100000)}L`; // lakh
  if (Math.abs(v) >= 1000) return `${s}${trim(v / 1000)}k`;
  return `${s}${Math.round(v)}`;
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
