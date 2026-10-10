import { getContext, setContext } from 'svelte';
import { formatBytes } from '$lib/utils';
import { de } from './de';
import { en, type Messages } from './en';

export type { Messages };
export type Locale = 'en' | 'de';

export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
];
/** Set when someone picks a language; otherwise the browser's language counts. */
export const LOCALE_COOKIE = 'optik_locale';

const catalogs: Record<Locale, Messages> = { en, de };
const isLocale = (value: unknown): value is Locale => value === 'en' || value === 'de';

export const messages = (locale: Locale): Messages => catalogs[locale];

/** The chosen language (cookie), else the first supported one the browser asks for, else English. */
export function resolveLocale(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(cookie)) return cookie;
  const wanted = (acceptLanguage ?? '')
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { lang: tag.trim().slice(0, 2).toLowerCase(), q: q ? Number(q.split('=')[1]) : 1 };
    })
    .filter((w) => w.lang && w.q > 0)
    .sort((a, b) => b.q - a.q);
  return wanted.map((w) => w.lang).find(isLocale) ?? 'en';
}

/** Dates, numbers and sizes the way the language writes them. */
export function formatters(locale: Locale) {
  const tag = locale === 'de' ? 'de-DE' : 'en';
  const withPercent = (share: number | null, options: Intl.NumberFormatOptions) => {
    const value = ((share ?? 0) * 100).toLocaleString(tag, options);
    return locale === 'de' ? `${value} %` : `${value}%`;
  };
  return {
    date: (iso: string | Date) =>
      new Date(iso).toLocaleDateString(tag, { year: 'numeric', month: 'short', day: 'numeric' }),
    dateTime: (iso: string | Date) =>
      new Date(iso).toLocaleString(tag, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    dateTimeSeconds: (iso: string | Date) =>
      new Date(iso).toLocaleString(tag, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    /** 1536 → "1.5 KB" / "1,5 KB" */
    bytes: (n: number) => formatBytes(n, tag),
    number: (n: number, digits?: number) =>
      n.toLocaleString(tag, digits === undefined ? {} : { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    /** 0.1234 → "12.34%" / "12,34 %" */
    percent: (share: number | null, digits = 2) => withPercent(share, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    /** Without trailing zeros: 0.005 → "0.5%" / "0,5 %" */
    percentUpTo: (share: number | null, maxDigits = 3) => withPercent(share, { maximumFractionDigits: maxDigits }),
  };
}

export type I18n = { locale: Locale; m: Messages; f: ReturnType<typeof formatters> };

const KEY = Symbol('i18n');

/** Called by the layouts with the request's language. */
export function provideI18n(locale: () => Locale) {
  setContext(KEY, locale);
}

/**
 * Texts and formatters for the current language. Changing the language
 * reloads the page, so components read them once.
 */
export function useI18n(): I18n {
  const locale = (getContext<(() => Locale) | undefined>(KEY) ?? (() => 'en' as Locale))();
  return { locale, m: catalogs[locale], f: formatters(locale) };
}
