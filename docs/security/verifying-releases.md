# Verifying releases

Every release image and Helm chart is signed with [cosign](https://github.com/sigstore/cosign) (keyless, via GitHub Actions OIDC) and comes with an SPDX SBOM — as a registry attestation and as a release asset.

```bash
cosign verify ghcr.io/alexanderkrust/optik:<version> \
  --certificate-identity-regexp '^https://github.com/alexanderkrust/optik-visual-regression-testing/\.github/workflows/release\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

```bash
cosign verify-attestation ghcr.io/alexanderkrust/optik:<version> --type spdxjson \
  --certificate-identity-regexp '^https://github.com/alexanderkrust/optik-visual-regression-testing/\.github/workflows/release\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

The chart is verified the same way: `cosign verify ghcr.io/alexanderkrust/charts/optik:<version> …`. Air-gapped bundles are signed as files — verify them with `cosign verify-blob` and the `.sigstore.json` from the release (see `INSTALL.md` in the bundle).
