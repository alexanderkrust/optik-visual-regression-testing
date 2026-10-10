import { describe, expect, it } from 'vitest';
import { de } from './de';
import { en } from './en';
import { formatters, resolveLocale } from './index';

/** Dotted paths of every text, e.g. "audit.actions.auth.login" */
function keys(catalog: object, prefix = ''): string[] {
  return Object.entries(catalog).flatMap(([key, value]) =>
    value && typeof value === 'object' ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

describe('resolveLocale', () => {
  it('prefers the cookie', () => {
    expect(resolveLocale('de', 'en-US,en;q=0.9')).toBe('de');
  });

  it('takes the first supported language the browser asks for', () => {
    expect(resolveLocale(null, 'fr-FR,de-DE;q=0.8,en;q=0.5')).toBe('de');
    expect(resolveLocale(undefined, 'de;q=0.3,en;q=0.9')).toBe('en');
  });

  it('falls back to English', () => {
    expect(resolveLocale('xx', 'fr,it;q=0.5')).toBe('en');
    expect(resolveLocale(null, null)).toBe('en');
  });
});

describe('catalogs', () => {
  it('have the same texts in every language', () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });

  it('have no empty texts', () => {
    for (const catalog of [en, de]) {
      const texts = (node: object): unknown[] =>
        Object.values(node).flatMap((value) => (value && typeof value === 'object' ? texts(value) : [value]));
      expect(texts(catalog)).not.toContain('');
    }
  });
});

describe('formatters', () => {
  it('write numbers the way the language does', () => {
    expect(formatters('en').percent(0.1234)).toBe('12.34%');
    expect(formatters('de').percent(0.1234)).toBe('12,34 %');
    expect(formatters('en').percentUpTo(0.005)).toBe('0.5%');
    expect(formatters('de').percentUpTo(0.005)).toBe('0,5 %');
    expect(formatters('en').bytes(1536)).toBe('1.5 KB');
    expect(formatters('de').bytes(1536)).toBe('1,5 KB');
  });
});
