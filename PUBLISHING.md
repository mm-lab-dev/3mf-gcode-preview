# 0.6.3 release checklist

Source repository: https://github.com/mm-lab-dev/3mf-gcode-preview

`npm run package` builds a VSIX for local review. Its `vscode:prepublish` hook builds the extension before packaging; it does not publish to the Marketplace.

Version 0.6.3 was prepared on 2026-11-26 after rebasing onto the remote dependency updates. Local package: `test-results/3mf-gcode-preview-0.6.3.vsix` (22 files, 3,424,091 bytes). Package, lockfile and VSIX manifest versions match; bundled code and translations match the repository, and sample/test files are excluded. See [the verification record](TESTING.md) for test results. Marketplace publication is pending.

VSIX SHA-256: `35fbe2dc92e4c0fc9679e8f9289556dfa77ef4aacadec8337512a07b4e4c361e`.

Release changes: dependency updates; includes the 0.6.2 filament rendering and zoom improvements.

Local installation: run **Extensions: Install from VSIX...** in VS Code and select the prepared file.

## Before publishing

1. Confirm that the Marketplace publisher account can publish under the `mm-lab` ID in `package.json`.
2. Verify that `resources/icon.png` appears in the Marketplace listing, and prepare representative screenshots made with files that may be shown publicly.
3. Check representative sliced 3MF files, large plates, and a real Remote-SSH session on supported installations.
4. Review README, SUPPORT, the MIT license, third-party notices, and the packaged VSIX file list.
5. Confirm that local `.gcode.3mf` samples are absent from the VSIX.
6. After publication is explicitly authorized, commit and push the prepared source, then publish with `npm run publish` or upload the reviewed VSIX through Marketplace publisher management.
