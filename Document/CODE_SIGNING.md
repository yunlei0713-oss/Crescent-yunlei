# Code Signing and Notarization

Signed builds remove Gatekeeper “damaged” false positives on macOS and SmartScreen warnings on Windows. Crescent’s release workflow signs and notarizes **only when the required repository secrets are present**; otherwise it still publishes unsigned artifacts (with the README quarantine workaround).

## macOS — Developer ID + Notarization

### Certificates and Apple credentials

1. Create a **Developer ID Application** certificate in the Apple Developer account.
2. Export it as a `.p12` and base64-encode the file for CI:

   ```bash
   base64 -i DeveloperID.p12 | pbcopy
   ```

3. Create an App Store Connect **API key** (or an app-specific password) for notarization.

### Repository secrets

| Secret             | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `CSC_LINK`         | Base64-encoded `.p12` (or path/URL supported by electron-builder) |
| `CSC_KEY_PASSWORD` | Password for the `.p12`                                           |
| `APPLE_API_KEY`    | App Store Connect API key `.p8` contents (or file contents)       |
| `APPLE_API_KEY_ID` | Key ID                                                            |
| `APPLE_API_ISSUER` | Issuer UUID                                                       |

Alternative notarization path (instead of API key): `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

### Local signed build

```bash
export CSC_LINK=...
export CSC_KEY_PASSWORD=...
export APPLE_API_KEY=...
export APPLE_API_KEY_ID=...
export APPLE_API_ISSUER=...
npm run build:mac
```

`electron-builder.yml` already enables `hardenedRuntime`, entitlements, and `notarize: true`. Every packaging entry point and the single release-workflow build job target **macOS Intel (x64) only**. The application is named `墨巡.app`, with `moxun` DMG/ZIP filenames; the existing appId is preserved. Unsigned local builds use `npm run build:mac:unsigned` or `npm run build:mac:local`; neither signs, notarizes nor publishes. See [DEVELOPMENT.md](DEVELOPMENT.md) for the current packaging rule and offline procedure. The historical Windows signing reference below is not an active build or validation requirement.

### Verification

- Download the DMG/ZIP from GitHub Releases.
- Open without `xattr -cr` quarantine clearing.
- `spctl --assess --type execute /Applications/墨巡.app` should report accepted.

## Historical reference: Windows — Authenticode

Windows packaging is not enabled in the current npm entries or release workflow. The certificate notes below are historical reference only.

### Certificate

Use an EV or standard code-signing certificate from a trusted CA. Export as `.pfx`.

### Repository secrets

| Secret                 | Purpose                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `WIN_CSC_LINK`         | Base64-encoded `.pfx` (electron-builder prefers `CSC_LINK` on Windows runners; use `WIN_CSC_LINK` when macOS and Windows certs differ) |
| `WIN_CSC_KEY_PASSWORD` | Password for the `.pfx`                                                                                                                |

When only one cert is used across platforms, `CSC_LINK` / `CSC_KEY_PASSWORD` on the Windows job is enough.

### Historical local signing environment

```bash
export CSC_LINK=...
export CSC_KEY_PASSWORD=...
# The former build:win command has been removed; do not use this as a current build flow.
```

### Verification

- Installer should show a trusted publisher.
- `Get-AuthenticodeSignature .\crescent-*-setup.exe` should be `Valid`.

## Historical reference: Linux

AppImage / deb builds are not code-signed with Apple/Microsoft tooling. Rely on `SHA256SUMS.txt` on the GitHub Release and, where applicable, distribution package signing outside this repo.

## CI behavior

`.github/workflows/release.yml`:

- Signing secrets are staged as `*_RAW` env vars and only promoted to `CSC_LINK` / `APPLE_*` when non-empty. An empty `CSC_LINK=""` must never reach electron-builder (it treats that as a cert path and fails with `<repo> not a file`).
- If macOS signing secrets are set: build with notarization and hardened runtime enabled; do not force `CSC_IDENTITY_AUTO_DISCOVERY=false`.
- Otherwise: keep the current unsigned path (`notarize=false`, `hardenedRuntime=false`, `CSC_IDENTITY_AUTO_DISCOVERY=false`, CSC\_\* unset).
- The build matrix contains only macOS Intel (x64); Windows/Linux assets are not generated.

## Auto-update dependency

In-app updates via `electron-updater` expect release assets (including `latest*.yml` / blockmaps) on GitHub Releases. Signed macOS/Windows builds are strongly recommended before enabling auto-download for end users; check-only still works against public release metadata.
