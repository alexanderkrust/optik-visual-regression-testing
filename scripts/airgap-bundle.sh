#!/usr/bin/env bash
# Builds the air-gapped installation bundle for one architecture:
#   optik-<version>-airgap-<arch>.tar.gz with images.tar (optik + PostgreSQL),
#   docker-compose.yml, the Helm chart, INSTALL.md and SHA256SUMS.
#
#   scripts/airgap-bundle.sh <version> <arch> <optik-image-ref> <chart.tgz> [out-dir]
#
# <optik-image-ref> is pulled from a registry for linux/<arch> (crane, no Docker
# daemon needed) and stored as ghcr.io/alexanderkrust/optik:<version>.
# Set CRANE to override the crane command.
set -euo pipefail

version=$1 arch=$2 image_ref=$3 chart=$4 out=${5:-.}
crane=${CRANE:-crane}
postgres_tag=16-alpine
name="optik-$version-airgap-$arch"
here=$(cd "$(dirname "$0")/.." && pwd)

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
dir="$work/$name"
mkdir -p "$dir" "$work/images"

# Each image as a docker-loadable tarball for the requested platform
$crane pull --platform "linux/$arch" "$image_ref" "$work/images/optik.tar"
$crane pull --platform "linux/$arch" "postgres:$postgres_tag" "$work/images/postgres.tar"

# One images.tar with both images, tagged as the compose file expects
python3 - "$work/images" "$dir/images.tar" "ghcr.io/alexanderkrust/optik:$version" "postgres:$postgres_tag" <<'PY'
import json, sys, tarfile, io
src, dest, optik_tag, postgres_tag = sys.argv[1:]
manifest, seen = [], set()
with tarfile.open(dest, "w") as out:
    for file, tag in (("optik.tar", optik_tag), ("postgres.tar", postgres_tag)):
        with tarfile.open(f"{src}/{file}") as t:
            entry = json.load(t.extractfile("manifest.json"))[0]
            entry["RepoTags"] = [tag]
            manifest.append(entry)
            for m in t.getmembers():
                if m.name == "manifest.json" or m.name in seen:
                    continue
                seen.add(m.name)
                out.addfile(m, t.extractfile(m) if m.isfile() else None)
    data = json.dumps(manifest).encode()
    info = tarfile.TarInfo("manifest.json")
    info.size = len(data)
    out.addfile(info, io.BytesIO(data))
PY

substitute() {
  sed -e "s/__VERSION__/$version/g" -e "s/__ARCH__/$arch/g" -e "s/__POSTGRES_TAG__/$postgres_tag/g" "$1"
}
substitute "$here/docker/airgap/docker-compose.yml" > "$dir/docker-compose.yml"
substitute "$here/docker/airgap/INSTALL.md" > "$dir/INSTALL.md"
cp "$chart" "$dir/"

(cd "$dir" && sha256sum images.tar docker-compose.yml INSTALL.md "$(basename "$chart")" > SHA256SUMS)
tar -C "$work" -czf "$out/$name.tar.gz" "$name"
echo "$out/$name.tar.gz"
