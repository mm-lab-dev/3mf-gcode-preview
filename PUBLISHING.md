# 0.6.4 release checklist

Source repository: https://github.com/mm-lab-dev/3mf-gcode-preview

`npm run package` builds a VSIX for local review. Its `vscode:prepublish` hook builds the extension before packaging; it does not publish to the Marketplace.

Version 0.6.4 was prepared on 2026-11-26. Local package: `test-results/3mf-gcode-preview-0.6.4.vsix` (22 files, 3,427,991 bytes). Package, lockfile and VSIX manifest versions match; bundled code and translations match the repository, and sample/test files are excluded. See [the verification record](TESTING.md) for test results. Marketplace publication is pending.

VSIX SHA-256: `07585dd20b5f0a394238c7a08e5c79fcfa12a0af3aab742c926959d447ffb3aa`.

Release changes: direct surface-based panning at high zoom and Japanese translations for corrupt 3MF and invalid UTF-8 G-code errors.

Local installation: run **Extensions: Install from VSIX...** in VS Code and select the prepared file.

## Before publishing

1. Confirm that the Marketplace publisher account can publish under the `mm-lab` ID in `package.json`.
2. Verify that `resources/icon.png` appears in the Marketplace listing, and prepare representative screenshots made with files that may be shown publicly.
3. Check representative sliced 3MF files, large plates, and a real Remote-SSH session on supported installations.
4. Review README, SUPPORT, the MIT license, third-party notices, and the packaged VSIX file list.
5. Confirm that local `.gcode.3mf` samples are absent from the VSIX.
6. After publication is explicitly authorized, commit and push the prepared source, then publish with `npm run publish` or upload the reviewed VSIX through Marketplace publisher management.
