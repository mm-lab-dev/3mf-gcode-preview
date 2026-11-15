# Verification record

## 0.5.0 — 2026-11-16

- Node.js tests: 39 passed, including the saved current-position marker preference, independent legend expansion preferences, defaults for older settings, and connected wipe motion geometry including tessellated arcs.
- Expandable legends: Playwright checks independent mouse/Enter/Space operation, saved-state application, plate reload and color-mode persistence, unchanged WebGL output and marker visibility, Japanese/English headings, and narrow layout. Visually checked `test-results/expandable-legends.png`.
- Playwright UI: passed, including all marker toggles OFF in line and filament modes (no colored markers or white cursor), independent cursor restoration, lower-layer marker visibility in cumulative and angled side views, single-layer isolation, marker restoration when stepping back into a lower layer, full masking by an upper path, restored round markers when the occluder is hidden, and partial-contact masking. All 15 local sliced samples passed the existing checks.
- Wipe-path UI: consecutive moves form one thin continuous stroke rather than spheres. In `sample/sample_bambu_studio2.gcode.3mf`, layer 302 renders twelve wipe motion segments as two connected strokes; checked in filament and line modes, with the wipe toggle and playback progress. Visually reviewed `test-results/wipe-layer302.png`.
- Build and diff whitespace checks passed. Extension Host checks were not rerun.
- `sample/16.gcode` regression: isolate first-layer events and review layers 1–2 from top and angled views at normal and enlarged zoom. Detected marker-colored pixels over solid second-layer paths: 0 in all four views after the fix. The prior shader/camera behavior failed the same check with 774 pixels in the angled view and 1,675 with the earlier zoom setting. Exposed first-layer markers remain visible from the side; the input SHA-256 remains unchanged. `npm run test:ui` includes this check when the local sample exists (otherwise it reports a skip). Review images and measurements are in `test-results/sample16-layer2-*.png` and `test-results/sample16-markers.json`.
- Version 0.5.0 is set in the extension manifest and both root lockfile entries. `3mf-gcode-preview-0.5.0.vsix` built successfully: 22 files, 3,417,431 bytes. Its manifest version, bundled code, Japanese/English translations, changelog and images were inspected; local samples, source scripts and tests are absent. README usage text is current, with relative links rewritten by vsce. SHA-256: `dfa2ebef2a53a50d5dfa0ef51edc77dece87fe5a1fe736c4c0a98918d0505109`. Inspection metadata is in `test-results/release-0.5.0.json`. Marketplace publication has not been performed.

## 0.4.0 — 2026-11-15

- Node.js tests: 37 passed. Coverage includes standalone text G-code loading, binary rejection without stale state, explicit cross-slicer aliases, unknown names, source labels and segment counts, worker transfers/repeated parsing, and saved category filters.
- Playwright UI: passed Japanese/English labels, original source names, line/bead rendering, and independent category filters. Feature, speed, and marker lists match actual whole-plate data, remain stable across layer selection/playback, retain restore controls, and preserve preferences across files where a category is absent. Speed-band boundaries at 0/50/100/150/200/300 mm/s and marker-free plates are covered.
- All 15 current local sliced samples passed parsing and feature/speed/tool-mode UI checks. The read-only audit verified unchanged SHA-256 hashes, per-source segment counts, and zero retained Other extrusion. Samples are ignored by Git and excluded from distribution; they do not establish compatibility with every printer profile.
- Ironing extrusion was confirmed in Bambu Studio (241 segments), OrcaSlicer (241), and PrusaSlicer (356). The current Cura inputs have no independent Ironing tag. Prime tower was confirmed in Bambu Studio and the Anker/Anycubic/Bambu Orca profiles; gap infill in Bambu Studio and the Anycubic/Bambu Orca profiles.
- Comment-only Custom tags are recorded separately from retained extrusion. Unknown-name behavior is covered by synthetic tests. Cura SKIN remains Solid infill; top/bottom is not inferred from geometry. Original names are retained even for grouped classifications.
- Added category labels follow the interface language. Floating vertical shell is フローティング・バーティカル・シェル in Japanese. Prime tower uses light gray (#e0e0e0); Other uses darker gray (#8b929e).
- Feature audit and UI checks automatically discover local sample*.gcode and sample*.gcode.3mf files, including numbered and printer-profile variants. Run node scripts/audit-sample-features.js to regenerate test-results/sample-feature-audit.json with input hashes, generator headers, layer/segment counts, classification rules, and per-source extrusion/travel counts.
- The generated MODEL-001 geometry-only 3MF was separately checked with FreeCAD 1.1.3: five valid, closed solids; 80 x 60 x 25 mm overall; closed, consistently oriented meshes; matching CAD/mesh volumes; FCStd reopen; serialized 3MF checks; and model-viewer loading. Source scripts are in scripts/create-feature-coverage.py and scripts/preview-feature-coverage.js; generated artifacts remain in the ignored sample directory.
- Extension version and root lockfile versions are 0.4.0; @vscode/vsce is pinned to 4.1.1. README is user-facing; the mapping and audit instructions are retained below as a development reference.
- Firmware-specific behavior, M600 material-change colors, real printer execution, and Remote-SSH remain outside current validation. VS Code Extension Host and VSIX packaging were not rerun for 0.4.0. No new VSIX has been generated or published.

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

## Slicer feature mapping (development reference)

Feature colors use a shared classification. The feature legend lists only categories with actual paths in the loaded plate; comment-only tags are excluded. The speed legend lists only bands containing extrusion paths, with travel kept separate. In feature and speed modes, Travel is omitted if there are no travel segments. The action-marker legend likewise lists only marker kinds recorded in that plate, and its heading is omitted when there are none. Selecting layers, playing paths, or hiding a category or marker keeps those lists stable so hidden items can be restored. Opening another plate or file rebuilds the lists while retaining visibility preferences. Hover a feature legend button to see the source names and extrusion-segment counts for that plate. The path details also show the selected segment's original feature name. Counts cover the loaded plate, rather than only the visible layer range.

The following names were observed in the local feature-coverage samples. A dash means the sample contained no matching tag; it does not mean the slicer lacks the feature.

| Viewer category | Bambu Studio | OrcaSlicer | PrusaSlicer | UltiMaker Cura |
| --- | --- | --- | --- | --- |
| Outer wall | `Outer wall` | `Outer wall` | `External perimeter` | `WALL-OUTER` |
| Inner wall | `Inner wall` | `Inner wall` | `Perimeter` | `WALL-INNER` |
| Infill | `Sparse infill` | `Sparse infill` | `Internal infill` | `FILL` |
| Solid infill | `Bottom surface`, `Internal solid infill` | `Bottom surface`, `Internal solid infill` | `Solid infill` | `SKIN` |
| Top surface | `Top surface` | `Top surface` | `Top solid infill` | — |
| Bridge | `Bridge` | `Bridge`, `Internal Bridge` | `Bridge infill` | — |
| Support | `Support` | `Support` | `Support material` | `SUPPORT` |
| Support interface | `Support interface` | `Support interface` | `Support material interface` | `SUPPORT-INTERFACE` |
| Overhang wall | `Overhang wall` | `Overhang wall` | `Overhang perimeter` | — |
| Floating vertical shell | `Floating vertical shell` | — | — | — |
| Ironing | `Ironing` | `Ironing` | `Ironing` | — |
| Prime tower | `Prime tower` | `Prime tower` | — | — |
| Gap infill | `Gap infill` | `Gap infill` | — | — |
| Skirt / brim | — | `Skirt` | `Skirt/Brim` | `SKIRT` |
| Other | `Custom`* | `Custom`* | `Custom`* | — |

*The `Custom` tags in these samples have no retained extrusion segments, so they do not establish verified Other extrusion. Travel is inferred from motion and extrusion, rather than from a feature name. `SKIN` stays Solid infill because its tag does not distinguish the top from the bottom. Skirt/brim and internal/ordinary bridges remain grouped, with their original names preserved.

Recognized names are explicitly listed in `src/gcode.js`; matching ignores case and repeated whitespace. Unlisted names stay Other, with the source name retained. All category labels follow the interface language, including Floating vertical shell (フローティング・バーティカル・シェル in Japanese); source names retain their original spelling. Bambu Studio defines Floating vertical shell separately from walls, solid infill, and bridges in its [official extrusion-role mapping](https://github.com/bambulab/BambuStudio/blob/master/src/libslic3r/ExtrusionEntity.cpp).

Run `node scripts/audit-sample-features.js` to audit all local `sample*.gcode` and `sample*.gcode.3mf` files and write `test-results/sample-feature-audit.json`. It records source hashes, generator headers, recognition rules, and actual segment counts separately from comment-only tags. Available local samples are also discovered automatically by the UI test, including printer-profile variants.
