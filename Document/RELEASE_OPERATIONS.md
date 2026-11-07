# Release Operations

Crescent releases are tag-driven product releases, not ad-hoc CI artifacts.

## Release Decision

- Only tags matching `v*` publish GitHub Releases.
- Release tags must point to commits contained in `main`.
- CI validates typecheck, lint, tests, and build before regular changes are merged.
- Release workflow builds macOS Intel (x64) downloadable artifacts only and publishes checksums.

## Preflight

1. Confirm the intended commit is on `main`.
2. Run:

   ```bash
    npm run verify:local
   ```

   macOS native branding: `postinstall`, `predev` and `prestart` run `scripts/prepare-development-icons.cjs` before Electron launches. It regenerates edge-to-edge approved mountain/river artwork without an extra inset (macOS 26 supplies its own Dock tile), and updates the development bundle name to `墨巡`, identity to `com.crescent.moxun.dev`, and a content-addressed ICNS filename. Main does not swap in a runtime PNG; launch and minimized-window icons share the native ICNS. Validate the system-rendered artwork scale, not just source PNG dimensions. Data paths and the packaged app id stay unchanged. Fully quit old processes before restarting; old pinned installed apps need rebuilding and re-pinning, not a global Dock/cache reset. See [DEVELOPMENT.md](DEVELOPMENT.md).

3. Confirm `.github/release-template.md` has any release-specific notes updated.
4. Confirm `electron-builder.yml` targets match the platforms being announced.
5. Create and push a version tag:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

## Artifact Expectations

- macOS Intel only: `moxun-<version>-x64.dmg` and `moxun-<version>-x64-mac.zip`, containing `墨巡.app`.
- No arm64, Universal, Windows or Linux packages. The original appId and data directories are preserved.
- `SHA256SUMS.txt` must be attached to the release.

## Code signing

Signed / notarized builds are optional until certificate secrets are configured. See [CODE_SIGNING.md](./CODE_SIGNING.md) for macOS Developer ID, notarization, and Windows Authenticode setup.

When secrets are present, the release workflow signs macOS (with notarization). Without secrets, unsigned Intel artifacts are still published; review the macOS security guidance in the README before installing.

## Auto-update feed

Release assets must include electron-builder update metadata (`latest*.yml`, `.blockmap`) so the in-app updater can discover versions from GitHub Releases (`provider: github` in `electron-builder.yml`).

## Packaging smoke tests

After a local or CI package build, verify artifact layout:

```bash
npm run smoke:packaging
```

Optionally point at a directory of downloaded release assets:

```bash
npm run smoke:packaging -- ./release-assets
```

## macOS application bundle

Run the layout and native-architecture check against an unpacked app or the app from a mounted DMG. Pass the workspace as a second argument to compare the packaged entry points with the current build.

```sh
node scripts/smoke-macos-app.cjs "/path/to/墨巡.app" "$PWD"
```

The check reads ASAR entries, terminal renderer isolation, xterm notices, the x64 executable and the unpacked node-pty helper. App launch and operator acceptance are separate checks. The local unsigned packaging entry runs `verify:local` before packaging and uses that build output.

## Follow-up

- Check the GitHub Release assets are present and named by platform/architecture.
- Confirm `latest-mac.yml` and `SHA256SUMS.txt` are attached.
- Run `npm run smoke:packaging` against the downloaded assets or `dist/`.
- Download at least one artifact for the target platform and confirm it starts.
- If publishing a prerelease, include a hyphen in the tag, for example `v1.2.0-beta.1`.
