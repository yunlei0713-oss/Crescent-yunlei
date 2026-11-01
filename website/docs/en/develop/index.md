# Run from source and contribute

From the repository root:

```bash
npm ci
npm run dev
```

Pi versions follow the root lockfile; the website has separate dependencies and a lockfile. Agents cannot execute terminal commands or call OpenAPI tools. Agent MCP is disabled because its reviewed implementation allowlist is empty; explicit settings-side discovery is separately controlled.

## Gates and packaging

```bash
npm run verify:local
npm run build:mac:local
```

`verify:local` runs CI (lint, static security and build including typecheck), then local behavior tests. Test files stay local-only. Pre-commit runs CI automatically; when local tests exist, run the complete gate yourself before committing.

Packaging targets macOS Intel (x64) only: `墨巡.app` and `moxun` DMG/ZIP filenames. Local builds disable signing, notarization and publishing; `build:mac` uses preconfigured signing. Only `:x64` aliases remain; arm64/Universal and Windows/Linux packaging entries have been removed. Freeze `out/` while packaging.

## Documentation site

```bash
npm run docs:dev
npm run docs:build
```

Site sources live in `website/`; deployment uses the controlled Pages workflow. This cleanup does not push or publish automatically.

Engineering contracts: [development](https://github.com/aide-family/Crescent/blob/main/Document/DEVELOPMENT.md), [testing](https://github.com/aide-family/Crescent/blob/main/Document/TESTING.md), [architecture](https://github.com/aide-family/Crescent/blob/main/Document/ARCHITECTURE.md), [signing](https://github.com/aide-family/Crescent/blob/main/Document/CODE_SIGNING.md).

Issues, pull requests and reusable Skills are welcome in the [repository](https://github.com/aide-family/Crescent). Never attach keys, user configuration or sensitive terminal output.
