# 0.3.0 release checklist

Source repository: https://github.com/mm-lab-dev/3mf-gcode-preview

`npm run package` builds a VSIX for local review. Its `vscode:prepublish` hook builds the extension before packaging; it does not publish to the Marketplace.

Prepared on 2026-10-08: `3mf-gcode-preview-0.3.0.vsix` was built and inspected. See [the verification record](TESTING.md) for test results and its SHA-256 hash. Marketplace publication is pending.

## Before publishing

1. Confirm that the Marketplace publisher account can publish under the `mm-lab` ID in `package.json`.
2. Verify that `resources/icon.png` appears in the Marketplace listing, and prepare representative screenshots made with files that may be shown publicly.
3. Check representative sliced 3MF files, large plates, and a real Remote-SSH session on supported installations.
4. Review README, SUPPORT, the MIT license, third-party notices, and the packaged VSIX file list.
5. Confirm that local `.gcode.3mf` samples are absent from the VSIX.
6. After publication is explicitly authorized, commit and push the prepared source, then publish with `npm run publish` or upload the reviewed VSIX through Marketplace publisher management.
