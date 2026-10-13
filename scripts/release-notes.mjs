#!/usr/bin/env node
// Prints the CHANGELOG section of a version — used as GitHub release notes.
//   node scripts/release-notes.mjs 0.1.0 [path/to/CHANGELOG.md]
//
// Changes whose text starts with "Security:" are listed first, under
// "Security fixes". Paragraphs starting with "Upgrade:" are also collected
// under "Upgrade notes" — what to do before or after upgrading.
import { readFileSync } from 'node:fs';

const version = process.argv[2];
const file = process.argv[3] ?? new URL('../apps/api/CHANGELOG.md', import.meta.url);
const changelog = readFileSync(file, 'utf8');
const sections = changelog.split(/^## /m).slice(1);
const section = sections.find((s) => s.startsWith(`${version}\n`));
if (!section) {
  console.error(`No CHANGELOG entry for ${version}`);
  process.exit(1);
}

// Drop internal dependency bumps ("- @optik/core@0.1.0") and headings left empty
const notes = section
  .slice(version.length)
  .replace(/^- Updated dependencies.*\n(?:[ \t]+- .*\n?)*/gm, '')
  .replace(/^- @optik\/[\w-]+@\S+\n?/gm, '')
  .replace(/^### [^\n]+\n+(?=### |(?![\s\S]))/gm, '')
  .trim();

/** "- abc1234: text" entries, with their indented continuation paragraphs */
const entries = notes.match(/^- [\s\S]*?(?=^- |^### |(?![\s\S]))/gm) ?? [];
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const text = (entry) => entry.replace(/^- (?:[0-9a-f]{7,40}: )?/, '').trim();

const security = entries.filter((e) => /^Security:/.test(text(e)));
const upgrades = entries.flatMap((e) =>
  text(e)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => /^Upgrade:/.test(p))
    .map((p) => `- ${capitalize(p.replace(/^Upgrade:\s*/, '')).replace(/\n\s+/g, '\n  ')}`),
);

let rest = notes;
for (const e of security) rest = rest.replace(e, '');
rest = rest.replace(/^### [^\n]+\n+(?=### |(?![\s\S]))/gm, '').trim();

const out = [];
if (security.length) {
  out.push('### Security fixes', '', ...security.map((e) => `- ${capitalize(text(e).replace(/^Security:\s*/, ''))}`), '');
}
if (upgrades.length) out.push('### Upgrade notes', '', ...upgrades, '');
if (rest) out.push(rest);
console.log(out.join('\n').trim());
