# 墨巡 MoXun {{VERSION}}

Released on {{DATE}}.

Thank you for trying MoXun. This release includes macOS Intel (x64) packages only.

> MoXun is an AI operations workbench for real terminal sessions, SSH workflows, Skills, Wiki SOPs, and MCP integrations.

## Downloads

| Platform    | Asset                                                        | Notes                                      |
| ----------- | ------------------------------------------------------------ | ------------------------------------------ |
| macOS Intel | `moxun-{{VERSION}}-x64.dmg`, `moxun-{{VERSION}}-x64-mac.zip` | Intel-only build containing `墨巡.app`.    |
| Integrity   | `SHA256SUMS.txt`                                             | Verify downloaded files before installing. |

## Highlights

- Packaged and dev builds read password environment variables from the shell profile or user environment, not from a temporary terminal export.
- Subagents can take delegated tasks in their own docked subterminals.
- Compact older model context while keeping the chat timeline.
- Connections support favorites, manual reorder, a cluster host regex, and reconnect after a disconnect.
- Model providers can be enabled or disabled, and the workbench layout is remembered.

## Install Notes

- Close the running MoXun app before installing this version.
- Verify downloads with `SHA256SUMS.txt` before installing.
- Keep a copy of important local configuration before upgrading across major versions.
- Review configured OpenAPI and MCP tools after upgrading, especially tools that can change remote state.

### macOS: “is damaged and can’t be opened”

Signing and notarization depend on configured release credentials. Gatekeeper may show **“墨巡” is damaged and can’t be opened** after a browser download. Verify the source and checksum first; do not assume that the warning proves the package is intact.

1. Move `墨巡.app` into Applications.
2. Clear the quarantine attribute:

```bash
xattr -cr /Applications/墨巡.app
```

3. Open the app again.

More detail: see the install section in the repository README.

## Verification

```bash
shasum -a 256 -c SHA256SUMS.txt
```

## Feedback

Please report bugs or feature requests from the Issues page:

https://github.com/{{REPOSITORY}}/issues

Security reports should use GitHub Security Advisories rather than public issues.

## Maintainer Checklist

- Confirm the tag points to the intended `main` commit.
- Confirm the Intel DMG/ZIP, update metadata and checksums are attached; no other architecture/platform packages.
- Confirm `SHA256SUMS.txt` includes every downloadable package.
- Add highlights, breaking changes, or migration notes above when needed.
