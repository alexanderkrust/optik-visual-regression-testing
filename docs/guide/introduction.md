# How optik works

optik is open-source, self-hosted visual regression testing — an alternative to Chromatic that runs entirely in your infrastructure. Your tests take screenshots; optik compares each with its approved **baseline** and shows the differences for review.

Every snapshot is compared pixel by pixel with its **baseline** — the most recently accepted snapshot of the same name in the same **test suite**, found through the git history (see [Branches](/guide/branches)).

| Result | Status | Test |
|--------|--------|------|
| No baseline yet | `new` — becomes the baseline | passes |
| Identical to the baseline | `unchanged` | passes |
| Any pixel or the size differs | `changed` — needs review | **fails**, with a link to the review page |

Review changes in the web UI on the run page. Accept and reject are only offered for snapshots with visual changes:

- **Accept** — the new image becomes the baseline. The next run with the same image passes.
- **Reject** — the previous baseline stays. Runs keep failing until the UI matches the baseline again or a change is accepted.

An unreviewed change keeps failing in later runs as well.

## Runs without changes are merged

Only runs that matter for review are kept. When a run finishes and all its snapshots are `unchanged`, it is merged into the previous run of the same suite and branch — as long as that one had no visual changes either. The new run is not stored; the previous one gets its *last run* time (`updatedAt`), a run counter and the latest commit updated. Images of unchanged snapshots are never stored, since they equal the baseline.

So the run list shows: one entry per stretch of clean runs, every run with changes, and — after a change was reviewed — the next clean run as a new entry again.
