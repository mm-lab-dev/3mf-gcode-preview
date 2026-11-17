# 0.6.1 release checklist

Source repository: https://github.com/mm-lab-dev/3mf-gcode-preview

`npm run package` builds a VSIX for local review. Its `vscode:prepublish` hook builds the extension before packaging; it does not publish to the Marketplace.

Version 0.6.1 was prepared on 2026-11-18. `3mf-gcode-preview-0.6.1.vsix` was built and inspected: 22 files, 3,421,786 bytes. Package, lockfile and VSIX manifest versions match; bundled code, translations and images match the repository; README and changelog match after accounting for vsce's relative-link rewriting; local samples and test files are excluded. See [the verification record](TESTING.md) for test results. Marketplace publication is pending.

VSIX SHA-256: `37b4bdb43415ee0d8d7a2e0e71ba951a876053f5463e78fd4c5872e507323e08`.

Release changes: README simplification; includes the 0.6.0 dimensional readouts and their origins, preservation of thin ironing sections, measured ironing spacing and improved shading, and Japanese error-message completion. Ironing remains schematic: all passes are limited to adjacent spacing, underlying fill may be visible at the same Z, and closed-path end joins have not been changed in this release.

Local installation: run **Extensions: Install from VSIX...** in VS Code and select the prepared file.

## Before publishing

1. Confirm that the Marketplace publisher account can publish under the `mm-lab` ID in `package.json`.
2. Verify that `resources/icon.png` appears in the Marketplace listing, and prepare representative screenshots made with files that may be shown publicly.
3. Check representative sliced 3MF files, large plates, and a real Remote-SSH session on supported installations.
4. Review README, SUPPORT, the MIT license, third-party notices, and the packaged VSIX file list.
5. Confirm that local `.gcode.3mf` samples are absent from the VSIX.
6. After publication is explicitly authorized, commit and push the prepared source, then publish with `npm run publish` or upload the reviewed VSIX through Marketplace publisher management.
