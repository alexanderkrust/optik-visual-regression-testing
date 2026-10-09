# Changesets

optik has **one product version**: the Docker image, the Helm chart and all
`@optik/*` packages are released together (a "fixed" group).

Describe user-facing changes with a changeset in your pull request:

```bash
pnpm changeset
```

Pick any affected package and the bump type (patch / minor / major). The
summary ends up in `CHANGELOG.md` and the GitHub release notes.

On `main`, the release workflow keeps a "Version Packages" pull request up to
date. Merging it bumps the version and publishes the release.
