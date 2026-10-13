# Releasing

For maintainers. What users see is in [Releases and support](../releases.md).

## Regular releases

Every pull request with a user-facing change adds a changeset (`pnpm changeset`). In its text:

- start with **`Security:`** when it fixes a vulnerability — it is listed first in the release notes (see [security advisories](security-advisories.md));
- add a paragraph starting with **`Upgrade:`** when users have to do something — it is collected under *Upgrade notes*. Say what, before or after the upgrade, and for whom.

Changesets keeps a "Version Packages" pull request on `main` up to date. Merging it releases: image, chart, bundles, renderer images, tag and GitHub release (`.github/workflows/release.yml`).

## Declaring an LTS release

Normally the first minor release of a year.

1. Release it as usual (say `1.2.0`); in its changeset or release notes, call it the LTS release.
2. Create the line's branch from the tag: `git push origin v1.2.0:refs/heads/release/1.2` and protect it (Settings → Branches: pull requests required).
3. Add it to the table in [docs/releases.md](../releases.md) with *Security fixes until* = release date + 18 months, and remove lines whose period ended.

## Fixing an LTS line

1. Fix on `main` first. Then cherry-pick to `release/1.2` in a pull request against that branch, with a **patch** changeset (no new features).
2. Merging it makes Changesets open "Version Packages (release/1.2)" on that branch; merging that releases `1.2.x`. The workflow publishes it like any release, but only moves `:latest` and the GitHub "latest release" when it is the newest version overall; `:1.2` always follows the line.
3. Security fixes: follow [security advisories](security-advisories.md) — fix all supported lines before publishing.
