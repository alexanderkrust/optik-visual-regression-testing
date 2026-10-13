# optik Subscription Terms (Team and Enterprise)

> **DRAFT — not in force.** To be reviewed by a lawyer before use; see [README](README.md). *Proposed* values are suggestions.

These terms apply when a business buys a license for the **Team** or **Enterprise** edition of optik from **Alexander Rust** ("Licensor"). The customer ("Customer") and the Licensor agree on the edition, the number of reviewers, the update period and the fees in an **order form**; the order form and these terms together form the agreement. Where they differ, the order form prevails.

## 1. Definitions

- **optik** — the visual regression testing software published by the Licensor, consisting of the **Core** (licensed under the Apache License 2.0) and the **Enterprise Code** (files in directories named `ee`, licensed under the optik Enterprise License).
- **Edition** — Community (free, no license key), Team or Enterprise, with the features described in the documentation at the time of the order.
- **License Key** — a file signed by the Licensor stating the Customer, the edition, the number of reviewers, the update period and, for trials, an end date.
- **Reviewer** — a person who can accept or reject visual changes in the Customer's installation: an admin, or a maintainer or reviewer of any project, directly or through a team. People with read access only (viewers) and people who only run tests don't count.
- **Update Period** — the period stated in the License Key during which optik releases are built that the License Key unlocks.
- **Release** — a version of optik published by the Licensor, identified by its version number and build date.

## 2. License

2.1 The Licensor grants the Customer a non-exclusive, non-transferable right to install and use, for its own business purposes, the Enterprise Code of every Release **built within the Update Period**, for the edition and up to the number of Reviewers stated in the License Key — **without time limit**. The Core may be used under the Apache License 2.0 regardless of this agreement.

2.2 The Customer may run any number of installations (production, staging, test) and instances, as long as the Reviewers across all production installations don't exceed the licensed number. Affiliated companies may use the license if named in the order form.

2.3 Trial License Keys allow evaluation until their end date, not production use beyond it.

2.4 The restrictions of the optik Enterprise License apply, in particular: no circumventing the License Key verification, no distribution of the Enterprise Code outside unmodified Releases, and no offering of the Enterprise Code to third parties as a hosted service.

## 3. License Key and reviewers

3.1 The Licensor delivers the License Key electronically. optik verifies it offline; the Licensor receives no data from the Customer's installation.

3.2 If the Customer has more Reviewers than licensed, optik shows a notice to admins and the Enterprise features fall back to the Community edition until the number is within the license again or more Reviewers are licensed. optik never locks or deletes the Customer's data because of the license.

3.3 *Proposed:* once a year, at the Licensor's request, the Customer confirms in text form the highest number of Reviewers in the past year. Reviewers beyond the licensed number are invoiced for the remaining term at the agreed price per Reviewer (**true-up**); the Licensor does not audit installations.

## 4. Updates and support

4.1 During the Update Period the Customer may use all Releases built in it, including new features of its edition and security fixes. LTS Releases (long-term support) receive security fixes as patch Releases for **18 months** from their release; like every Release, a patch Release is covered by the License Key if it is built within the Update Period.

4.2 Support is provided according to the [Support Terms](support-terms.md) for the Customer's edition during the Update Period.

4.3 *Renewal:* the Update Period renews for successive periods of the same length unless either party cancels in text form **three months** (*proposed*) before its end. Without renewal, the Customer keeps the right under clause 2.1 for Releases built until the end of the Update Period.

## 5. Fees and payment

5.1 The fees are stated in the order form, net of VAT, payable within **30 days** (*proposed*) of invoice, annually in advance for each Update Period.

5.2 The Licensor may adjust the fees for a renewal by notice in text form at least three months before the renewal; the Customer may then cancel the renewal.

## 6. Customer's responsibilities

The Customer operates optik itself: hosting, network, TLS, the database and storage, backups, user management, applying updates, and keeping License Keys and API tokens confidential. The documentation describes the requirements.

## 7. Warranty

7.1 The Licensor warrants that the Enterprise Code of each Release, when used as documented, substantially provides the features described in the documentation for the edition at the time of the Release.

7.2 For defects reported in text form with a description that allows reproduction, the Licensor will, at its choice, fix the defect in a later Release or provide a workaround. If that fails within a reasonable period, the Customer may reduce the fees for the affected Update Period or, for material defects, terminate and receive a pro-rata refund of fees paid for the remaining Update Period.

7.3 The warranty period is **12 months** (*proposed*) from the delivery of the License Key. Releases built after the Update Period, modified Enterprise Code and use outside the documented requirements are not covered.

## 8. Liability

8.1 The Licensor is liable without limitation for intent and gross negligence, for injury to life, body or health, under the Product Liability Act, and as far as it has given a guarantee.

8.2 For slight negligence the Licensor is liable only for breach of an obligation whose fulfilment makes the proper performance of the agreement possible and on which the Customer may rely (*cardinal obligation*), and limited to the damage typical and foreseeable at the time of the agreement — at most the fees paid under this agreement in the **12 months** (*proposed*) before the event causing the damage.

8.3 The Licensor is not liable for loss of data that regular backups by the Customer, as described in the documentation, would have prevented.

## 9. Intellectual property claims (Enterprise)

*Proposed:* if a third party claims that the Enterprise Code infringes its intellectual property rights, the Licensor defends the Customer against the claim, provided the Customer informs the Licensor promptly and leaves the defence to it. The Licensor may modify or replace the affected code or obtain the necessary rights; if neither is reasonably possible, either party may terminate and the Customer receives a pro-rata refund. Clause 8 applies.

## 10. Data protection and confidentiality

10.1 In normal use the Licensor does not process personal data of the Customer: optik runs in the Customer's infrastructure and sends no data to the Licensor.

10.2 If the Customer gives the Licensor access to personal data for support — logs, database extracts, screen sharing — the parties first agree on a data processing agreement under Art. 28 GDPR, and the Customer shares only what is needed.

10.3 Both parties keep confidential the other party's non-public information they receive under this agreement, during its term and for three years after it.

## 11. Term and termination

11.1 The agreement starts with the order form and runs for the Update Period, renewing under clause 4.3.

11.2 Either party may terminate for good cause. Good cause for the Licensor includes the Customer's failure to pay undisputed fees within 30 days of a reminder, or a material breach of clause 2.4.

11.3 After termination for good cause by the Licensor, the right under clause 2.1 ends; otherwise it continues for Releases built within the last paid Update Period.

## 12. Final provisions

12.1 These terms apply only to businesses (*Unternehmer*, § 14 BGB), legal entities under public law and special funds under public law. The Customer's general terms don't apply, even if the Licensor doesn't object to them.

12.2 Changes to the agreement require text form.

12.3 German law applies, excluding the UN Convention on Contracts for the International Sale of Goods. Exclusive venue is the Licensor's seat [*place to be filled in*], if the Customer is a merchant.

12.4 If a provision is invalid, the rest of the agreement remains valid.
