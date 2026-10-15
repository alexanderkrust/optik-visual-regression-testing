# Editions and license

optik is open source under the [Apache License 2.0](https://github.com/alexanderkrust/optik-visual-regression-testing/blob/main/LICENSE). Enterprise features live in directories named `ee` and are licensed under the [optik Enterprise License](https://github.com/alexanderkrust/optik-visual-regression-testing/blob/main/ee/LICENSE): free to try and develop with, a license key is needed for production use. Without a license key it runs as **Community** edition: all core features, up to 5 reviewers.

| Edition | Reviewers | Adds |
|---|---|---|
| Community | 5 | — |
| Team | as licensed | — |
| Enterprise | as licensed | audit log, single sign-on (OIDC, SAML), SCIM provisioning, teams, retention policies |

*Reviewers* are the people who can accept or reject changes: admins, and maintainers and reviewers of any project. Developers who only run tests, and viewers, don't count.

Admins enter the license key under *License* (or set `OPTIK_LICENSE`). The key is a signed file checked **offline** — optik never contacts a license server, also in air-gapped networks. Licenses are perpetual: a key unlocks every optik release built until its *updates until* date, forever; later releases need a renewal. Nothing is ever locked or deleted because of the license — more reviewers than licensed, an expired trial or a too new release only show a notice to admins and fall back to Community.
