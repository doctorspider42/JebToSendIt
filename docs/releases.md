# Release builds

Use Node.js 26 (`nvm use`) and `npm ci`. Version 0.3.0 updates Electron to
45.2.2, electron-builder to 26.18.1, electron-store to 12.0.0 and i18next to
26.7.1. The lockfile pins the resolved dependency tree. `postinstall` copies the
installed i18next UMD into the renderer, so its embedded copy stays current.

## CI and publication

CI checks syntax, tests actions and daily record behavior, launches the real
sandboxed renderer with an isolated settings profile, and audits runtime
packages on Windows, Linux and macOS. Linux is a test host; Enter delivery and
release downloads support Windows and macOS.

The release workflow builds Windows portable x64 EXE and macOS arm64 + x64 DMGs.
Manual dispatch retains CI artifacts. A `vX.Y.Z` tag must match package.json;
publication waits for both operating systems and attaches their files to one
GitHub release. Neither a local build nor editing this workflow publishes a release.

All Node-based GitHub actions are updated to their current major versions, which
use a modern Node runtime. Application build tools use the Node version in
`.nvmrc`. Dependabot checks npm packages and GitHub Actions weekly.

## Apple signing — same identity and distribution model as Zitter

Use **Developer ID Application: Pawel Pajak (7L5KF39DAR)**, Hardened Runtime,
secure timestamp, app notarization/stapling and a separately signed, notarized,
stapled DMG containing an Applications shortcut. Electron needs its own JIT,
microphone and Apple Events entitlements; Chromium/Zitter's entitlement split
is not copied blindly. This is outside the Mac App Store.

GitHub-hosted macOS runners cannot use the private key or `zitter-notary`
profile stored in a local Mac Keychain. The release workflow uses the same
secret names as Pitch Doctor and tyraX: the Developer ID certificate for signing
and an App Store Connect API key (not an Apple ID password) for notarization.
Configure these repository Actions secrets before running the macOS release job:

| Secret | Value |
| --- | --- |
| `MACOS_CERT_P12_BASE64` | `base64 -i <file>.p12` — PKCS#12 export of the Developer ID certificate **and private key** |
| `MACOS_CERT_PASSWORD` | Password protecting that PKCS#12 export |
| `APPLE_API_KEY_P8_BASE64` | `base64 -i AuthKey_<id>.p8` — App Store Connect API key (Users and Access → Integrations → App Store Connect API, role Developer) |
| `APPLE_API_KEY_ID` | ID of that key |
| `APPLE_API_ISSUER` | Issuer ID shown above the key list |

Secret values cannot be copied between repositories; set them here with
`gh secret set <NAME>` (it prompts for the value), piping base64 for the files:

```sh
base64 -i ~/Documents/<certificate>.p12 | gh secret set MACOS_CERT_P12_BASE64
gh secret set MACOS_CERT_PASSWORD
base64 -i ~/path/AuthKey_<id>.p8 | gh secret set APPLE_API_KEY_P8_BASE64
gh secret set APPLE_API_KEY_ID
gh secret set APPLE_API_ISSUER
```

The certificate belongs to team `7L5KF39DAR`, already set in the workflow.
Keep these values private; enter them through GitHub's secret settings. A new
certificate, App ID or provisioning profile is not required. electron-builder
imports the signing credential into its temporary Keychain. Missing credentials
fail before the build; `forceCodeSigning` prevents unsigned release output.
The workflow validates app signatures, team, Hardened Runtime, stapled tickets
and Gatekeeper; it also verifies mounted DMG contents and a quarantined copy
with syspolicy_check, then produces SHA-256 files.

For a local Mac with the same Developer ID and existing Zitter credentials:

```sh
npm ci
export CSC_NAME='Pawel Pajak (7L5KF39DAR)'  # bez prefiksu "Developer ID Application:"
export APPLE_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
export APPLE_KEYCHAIN_PROFILE=zitter-notary
npm run build:mac -- --config.forceCodeSigning=true --config.mac.notarize=true
npm run notarize:dmg
```

Only publish the final DMGs after these commands succeed. Intermediate app/ZIP
outputs are not downloads. Apple submission may take time; inspect the reported
submission status before repeating an interrupted upload.

For a development package without contacting Apple:

```sh
npm run build -- --mac --dir --arm64 --config.mac.identity=- --config.mac.notarize=false
```

This is an ad-hoc development build, not a notarized download.

## Verification

```sh
npm run check
npm test
npm run smoke
npm audit --omit=dev
```

The smoke test exercises real electron-store persistence, sandboxed preload,
command/script controls, rapid settings edits, language switching and disabled
record notifications. It never executes the user's configured action. It writes
`dist/smoke.png` for visual review. On headless Linux use `xvfb-run -a npm run smoke`. GitHub-hosted Ubuntu
runs this with `--no-sandbox` because its user-namespace policy can block the
Chromium OS sandbox; preload isolation is still exercised. Local smoke tests
retain the OS sandbox.
Manual hardware checks still require a microphone, foreground target app and
macOS Accessibility/Automation authorization; tests cannot supply user consent.

The current latest electron-builder still pulls development-only packages with
15 moderate npm audit findings (minimatch dependency chain). Runtime audit is
clean. Do not apply `npm audit fix --force`: npm proposes downgrading the builder
to 20.x. Revisit when upstream provides compatible fixes; do not force unrelated
major versions into its dependency tree without validating packaging.
