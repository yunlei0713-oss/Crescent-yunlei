# Install

<LatestDownloads locale="en" />

The current Mac delivery standard is one Universal package containing Intel x64 and Apple Silicon arm64. Downloads come from historical releases: asset availability is not this round's acceptance or proof of signing. Windows adaptation is outside the current development scope.

## macOS security warnings

Verify the source, SHA-256, signing and notarization against release notes. A Gatekeeper “damaged” warning can reflect signing, quarantine or real corruption; do not assume the file is valid or remove quarantine for untrusted software. Unsigned local builds are for development only. See [code signing](https://github.com/aide-family/Crescent/blob/main/Document/CODE_SIGNING.md).

## From source

```bash
npm ci
npm run dev
```

See [development and packaging](/en/develop/). AI requires model configuration; manual terminal operation requires iTerm.
