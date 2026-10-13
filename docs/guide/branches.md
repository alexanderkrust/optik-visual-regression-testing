# Branches and baselines

The adapters send the commit and its git ancestors with every run. The baseline is the latest accepted snapshot from a run on one of these commits, so — like in Chromatic:

- a feature branch compares against the state it was branched from, not against later changes on `main`;
- accepting a change on a branch affects only that branch;
- a **merge commit** carries the branch's accepted changes over to `main`;
- after a **squash or rebase merge** the history is lost — so a snapshot that is pixel-identical to an already approved one is **accepted automatically** (shown as such in the UI) instead of asking for a second review.

**Fetch the git history in CI.** Most CI systems clone shallowly; with GitHub Actions use:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
```

Without history, optik falls back to the latest accepted snapshot on the same branch, then on the project's **default branch** (`main` unless changed under *Project → Settings*).

The branch is detected from the CI system (GitHub Actions, GitLab CI, Bitbucket Pipelines) or git; set `OPTIK_BRANCH` / `OPTIK_COMMIT` to override.
