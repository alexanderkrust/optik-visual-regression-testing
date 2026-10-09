#!/usr/bin/env node
// Prints the CHANGELOG section of a version — used as GitHub release notes.
//   node scripts/release-notes.mjs 0.1.0
import { readFileSync } from 'node:fs';

const version = process.argv[2];
const changelog = readFileSync(new URL('../apps/api/CHANGELOG.md', import.meta.url), 'utf8');
const sections = changelog.split(/^## /m).slice(1);
const section = sections.find((s) => s.startsWith(`${version}\n`));
if (!section) {
  console.error(`No CHANGELOG entry for ${version}`);
  process.exit(1);
}
// Drop internal dependency bumps ("- @optik/core@0.1.0") and headings left empty
const notes = section
  .slice(version.length)
  .replace(/^- @optik\/[\w-]+@\S+\n?/gm, '')
  .replace(/^### [^\n]+\n+(?=### |(?![\s\S]))/gm, '')
  .trim();
console.log(notes);
