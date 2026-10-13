# Commercial terms — drafts

> **DRAFT — not in force.** These documents are working drafts for the commercial editions of optik. They must be reviewed by a lawyer before they are offered to anyone or published as binding. Values marked *proposed* are suggestions, not commitments.

| Document | What it covers |
|---|---|
| [`../ee/LICENSE`](../ee/LICENSE) | The optik Enterprise License: what the Enterprise code in `ee/` may be used for (already in the repository, also a draft) |
| [`subscription-terms.md`](subscription-terms.md) | The agreement for buying Team and Enterprise licenses: license keys, reviewers, updates, fees, warranty, liability, term |
| [`support-terms.md`](support-terms.md) | Support per edition: channels, hours, severity levels, response targets, what's included |

The open-source core stays under the Apache License 2.0 and needs no agreement. Prices aren't part of these documents; they belong in an order form or price list.

## How the documents fit the product

The drafts follow how optik actually behaves, so the terms promise nothing the software doesn't do:

- License keys are checked **offline**; optik never contacts a license server and sends no data to the vendor.
- A key unlocks every release **built until the end of its update period — perpetually**; later releases need a renewal.
- **Nothing is ever locked or deleted** because of the license: too many reviewers, an expired trial or a too new release only show notices to admins and fall back to the Community edition.
- *Reviewers* = admins, and maintainers and reviewers of any project (directly or through teams). Viewers and people who only run tests don't count.
- Security fixes: response and fix targets in [SECURITY.md](../SECURITY.md); LTS releases get them for 18 months ([releases](../docs/releases.md)).

## Questions for the legal review

1. **Contract type** under German law: is a perpetual license with an update period a purchase (*Kauf*), with subscription-like updates (*Pflege*) — and what does that mean for warranty (§§ 434 ff. BGB) versus the support terms?
2. **B2B only**: is the restriction to businesses (*Unternehmer*, § 14 BGB) worded effectively, and are the liability limits valid as general terms (§§ 305 ff. BGB, in particular § 307 and § 309 Nr. 7)?
3. **Liability cap**: proposed at the fees paid in the 12 months before the claim — acceptable for cardinal obligations (*Kardinalpflichten*)?
4. **Reviewer overage**: true-up at renewal instead of enforcement — enough to protect the licensor? Is an annual self-certification appropriate, given there is no telemetry?
5. **IP indemnity** for the Enterprise edition: scope and cap.
6. **Data protection**: the vendor processes no customer data in normal use. Is a data processing agreement (Art. 28 GDPR) needed only when the customer grants support access (screen sharing, logs, database extracts) — and should a DPA template be attached for that case?
7. **Open-source components**: are the notices (SBOM, NOTICE, third-party licenses) sufficient; any copyleft components in the shipped images?
8. **Export control and sanctions** clause: needed, and in which form?
9. **Governing law and venue**: German law, venue at the licensor's seat — and an English and a German version: which prevails?
10. **Support response targets**: are they targets (best effort) or warranted service levels; service credits — yes or no?
11. **Trial licenses** and **evaluation use** (`ee/LICENSE` § 3): consistent with these terms?
12. **Contributions** to `ee/` code (`ee/LICENSE` § 5): is the Apache-2.0 grant to the copyright holder enough, or is a contributor license agreement needed?

## Product decision before the terms are final

13. **LTS patch releases after the update period.** optik unlocks a release if it was *built* within the license's update period. An LTS patch release (e.g. a security fix for 1.2.x) built after a customer's update period therefore falls back to the Community edition for them. The draft (Subscription Terms 4.1) follows that behaviour. If customers should get LTS security fixes for the whole LTS period regardless of renewal — a common expectation — the license check has to compare the update period with the release date of the LTS line's first release (`x.y.0`) instead of the patch's build date. Decide this before promising more in the terms.
