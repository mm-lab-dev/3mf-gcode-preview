# Verification record

## 0.3.0 — 2026-10-08

- Node.js tests: 32 passed, including archive extraction of project and slice settings.
- Playwright UI: passed for the project-rooted tree, selected-node parameter tables, keyword filtering retained across tree selections and cleared for a new 3MF, shared objects on multiple plates, plate-specific instance values, empty states, Japanese and English labels, and narrow layout. The README filter screenshot was generated from this test. Existing toolpath and model preview checks also passed.
- README images: overview, layer range, single layer, and structure panel were recaptured with `node scripts/capture-readme.js` from the local Bambu-style sample. The two path close-ups without UI were retained unchanged.
- VS Code Extension Host 1.140.0 / Windows: passed activation, command, Custom Editor, Webview handshake, virtual filesystem reads, and zero input writes.
- Local Bambu-style sample parsed read-only: one plate, 200 layers, 102,574 segments, 578 project-setting keys, plus model settings and slice information.
- VSIX: `3mf-gcode-preview-0.3.0.vsix` built successfully. The 22-file archive contains version 0.3.0, bundled code and styles, seven README images matching the repository files, notices, and no `.gcode.3mf` samples. SHA-256: `89495F1E221B312E1CA23CE3CE7081EF93B7BE90407BDB5A4F331124A50C25DC`.
- Real Remote-SSH use remains unverified. Marketplace publication has not been performed.

## 0.2.2 — 2026-10-05

- Node.js tests: 31 passed, including shared display settings and extension-side synchronization.
- Playwright UI: passed after the 10 mm grid and full-height layer slider changes.
- VS Code Extension Host 1.140.0 / Windows: passed activation, command, Custom Editor, Webview handshake, virtual filesystem reads, and zero input writes.
- VSIX: `3mf-gcode-preview-0.2.2.vsix` built successfully. Its file list includes six README screenshots and excludes local `.gcode.3mf` samples.
- Real Remote-SSH use remains unverified.

## 0.2.0 — 2026-10-03

Target: **3MF G-code Preview 0.2.0**. Verified on 2026-10-03.

| Check | Result | Coverage |
| --- | --- | --- |
| Node.js tests | 28 passed | ZIP archives, multiple plates, malformed inputs and size limits, G-code coordinates and extrusion, arcs, layers, features, tools, source lines, filament width and height, slicer time estimates, retract/unretract/wipe/outer-wall-start markers, startup retraction, bundled Worker |
| Playwright / Chromium | Passed | Japanese and English labels, legends, warnings, structure tree, narrow layouts, saved view settings across languages, WebGL rendering, layer selection, cumulative playback, pause/resume, path order, color and travel filters, plate switching, reload, and errors |
| 3MF model preview | Passed | Lit triangle meshes, cross-file Bambu-style components and transforms, cyclic-reference rejection |
| Legend controls | Passed | Feature, speed-band, tool, and Travel toggles; keyboard input; saved filters across color modes, layer changes, playback, and plate reloads; hidden paths absent from the WebGL image |
| Layer controls | Passed | Two knobs on one rail, single-layer mode, mouse and keyboard input, stable rail height and position across display changes, retained lower bound |
| Path rendering | Passed | Filament/line switching, saved render mode, rounded connected arcs, separate parallel curves, consistent corner width, slicer-provided width differences, layer and legend interactions, top and angled review images |
| Time and markers | Passed | Model/total time from G-code headers, missing-value fallback, four marker kinds, independent toggles, saved marker settings, path-progress and layer-range filtering, no duplicate retract during wipe |
| VS Code Extension Host 1.140.0 / Windows | Passed | Activation, command, Custom Editor, Webview handshake, virtual filesystem read, zero writes to input |
| VSIX inspection | Passed | Bundled JS/CSS, README, CHANGELOG, SUPPORT, and licenses included; node_modules, test VS Code, internal test record, and sample 3MF excluded |

The local `spool_case_body.gcode.3mf` was parsed read-only: 404 layers, 1,346,283 segments, and 19 kinds of routine firmware/unsupported-command notices. Routine notices were hidden; a synthetic omitted-arc case remained visible as a warning. The sample is ignored by Git and is not part of the VSIX.

The first layer was checked against the G-code for both the text and body extrusion paths. Its structure tree showed `body_bottom`, `body_text`, `body_structure_lower`, and `body_structure_upper`. For the first two layers, the selected range contained 14,749 segments and changed its current-layer display between steps 8,719 and 8,720. A numerical check over all 404 layers showed no layer jumps during playback and at least six updates per layer.

UI review images in `test-results/` include `layers.png`, `bead-top.png`, `arc-joints.png`, `swept-curves.png`, `swept-curves-iso.png`, `constant-width-corner.png`, `line-mode.png`, `layer-range.png`, `legend-filter.png`, `event-overview.png`, `event-markers.png`, `model.png`, `narrow.png`, and `narrow-en.png`. Run `npm run test:ui` to regenerate them.

Performance observations in software WebGL/Chromium: about 16.7 ms per frame with 50,000 paths, about 0.8 seconds to load a synthetic 250,000-path plate, and no WebGL draws while the view was idle.

Small automated 3MF inputs are assembled in memory. Two additional local Bambu Studio `.gcode.3mf` files were parsed read-only and yielded model/total time, 30-layer and 55-layer toolpaths, and four event kinds. Real Remote-SSH use and comparison against printer execution have not been verified. The extension has not been published to the Marketplace.
