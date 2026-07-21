# Releasing Table Fields

Obsidian downloads plugin updates from a **GitHub release whose tag exactly matches
`manifest.json#version`** (no `v` prefix). Release assets must include `manifest.json`, `main.js`,
and `styles.css`.

## Cut a release

1. Bump the version (same `x.y.z` in all three): `manifest.json`, `versions.json`, `package.json`.
2. Commit to `main`.
3. Tag and push, matching the manifest version exactly:
   ```bash
   git tag 0.1.0
   git push origin 0.1.0
   ```

## Preferred: attested release via GitHub Actions

Add the workflow below at `.github/workflows/release.yml`. Pushing a version tag then builds a
release whose assets carry build-provenance attestation (verified by Obsidian's review).

> Adding files under `.github/workflows/` requires a token/login with the `workflow` scope. The
> simplest way is the GitHub web UI: **Add file → Create new file →** path
> `.github/workflows/release.yml` → paste → commit.

```yaml
name: Release Obsidian plugin

on:
  push:
    tags:
      - "*"

permissions:
  contents: write
  id-token: write
  attestations: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Verify tag matches manifest version
        run: |
          MANIFEST_VERSION=$(node -p "require('./manifest.json').version")
          if [ "$MANIFEST_VERSION" != "${GITHUB_REF_NAME}" ]; then
            echo "Tag '${GITHUB_REF_NAME}' != manifest version '${MANIFEST_VERSION}'."
            exit 1
          fi

      - name: Attest build provenance
        uses: actions/attest-build-provenance@v2
        with:
          subject-path: |
            manifest.json
            main.js
            styles.css

      - name: Create GitHub release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "${GITHUB_REF_NAME}" \
            --title "${GITHUB_REF_NAME}" \
            --notes "Table Fields ${GITHUB_REF_NAME}." \
            manifest.json main.js styles.css
```

## Manual alternative (no attestation)

```bash
gh release create 0.1.0 --title 0.1.0 \
  --notes "Table Fields 0.1.0." \
  manifest.json main.js styles.css
```

## First-time Community Directory submission

1. Sign in at https://community.obsidian.md with your Obsidian account and link GitHub.
2. **Plugins → New plugin →** submit `https://github.com/fyaic/Table-Fields-Plugin`.
3. Agree to the developer policies; confirm the default branch (`main`) `manifest.json` is accurate.
4. Address any automated-review feedback, bump the version, and cut a new release.
