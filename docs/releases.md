# Releases and support

## Versions

optik has one version for everything it ships: the server image, the Helm chart, the adapters, the CLI. Versions follow [semantic versioning](https://semver.org): patch releases (`0.4.1`) fix things, minor releases (`0.5.0`) add features, a major release would remove or change something you rely on. Before 1.0, minor releases may also contain such changes — the release notes call them out under *Upgrade notes*.

Every release is announced as a [GitHub release](https://github.com/alexanderkrust/optik-visual-regression-testing/releases) with its notes, the signed image digest, the Helm chart and air-gapped bundles. The notes list, in this order:

- **Security fixes** — see [SECURITY.md](../SECURITY.md);
- **Upgrade notes** — anything to do before or after upgrading;
- all other changes.

## Which releases get fixes

| Line | Gets | For how long |
|---|---|---|
| **Latest release** | bug and security fixes, new features | until the next release |
| **LTS releases** | security fixes, and fixes for data loss or corruption — no new features, no behaviour changes | **18 months** from the LTS release |

Once a year, one minor release becomes an **LTS release** (long-term support) — normally the first minor release of the year, announced as such in its release notes. Its fixes come as patch releases of that line (`1.2.1`, `1.2.2` …), built and signed like every release. Because a new LTS arrives every 12 months and each is supported for 18, two LTS lines overlap for six months: time to plan the upgrade.

Images: `ghcr.io/alexanderkrust/optik:<version>`; `:<major>.<minor>` follows the newest patch of a line — pin that to get an LTS line's fixes, and `:latest` the newest release overall.

### Supported LTS releases

| LTS | Released | Security fixes until |
|---|---|---|
| — | | The first LTS release is planned with 1.0. |

## Upgrading

Upgrade from any release to any newer one directly — from one LTS to the next, too; there are no required intermediate versions. Database migrations run on start. See [Upgrading](upgrading.md) for the procedure and how to go back.

Licenses: a license key unlocks every release built within its update period (see the [README](../README.md#editions-and-license)); LTS patch releases of a line you already run count by their own build date.
