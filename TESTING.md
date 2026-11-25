# Verification record

## Unreleased — 2026-11-25 (VIEW-006)

- Supersedes the round joins of VIEW-002/003 and camera-motion detail switching of VIEW-004. Filament bodies and end caps now use fixed eight-sided sections with shared miter planes. Removed circular-sector meshes, sweep-subdivision selection and full/motion geometry switching. G-code centerlines, widths, heights, closed-loop neighbors, section-boundary caps and zoom controls are retained. Width/height steps remain visible; this does not smooth the source dimensions.
- Orientation caching retains directions, bisectors and miter factors (28 bytes per source segment, plus the existing neighbor lookup). No round-sector instances or attributes are allocated. Camera motion and stopped views use the same geometry.
- Node.js tests: 59 passed. Full Playwright UI suite passed, including all 15 existing local samples, dimensions, markers, joins and zoom. Marker leakage was zero in all four top/angled/zoomed views. Numerical coverage includes eight-sided body/cap alignment in both turn directions, exact section dimensions, closed seams and cached rewrites. UI coverage checks miter silhouettes, continuity, variable sections, filtering/playback and unchanged triangle counts through camera motion and display changes.
- Profiled `sample/spool_case_lid.gcode.3mf` with markers ON at 1200 × 850 using SwiftShader, fixed pointer gestures, test-only damping disabled and one-pixel readback. The before measurements reuse `test-results/view004/after-timings.json`: its held-gesture frames already used eight-sided sections with round joins. Production damping is unchanged. These synchronized software-render times are not native VS Code frame-rate guarantees.

| Selection | Rotate median ms, before → after | Pan median ms, before → after | Moving triangles, before → after | Draws/frame, before → after |
| --- | --- | --- | --- | --- |
| Layer 76 only, 32 frames/gesture | 53.9 → 32.7 | 53.2 → 32.5 | 87,532 → 56,780 | 26 → 14 |
| Layers 1–76, 8 frames/gesture | 5360.5 → 2544.0 | 5347.4 → 2539.6 | 9,444,072 → 5,560,280 | 46 → 22 |

- Render-time reduction is about 39% for layer 76 alone and 53% cumulatively in this software-render experiment. All four moving/stopped canvas image pairs are pixel-identical with test damping disabled; production-damping UI tests also require constant geometry throughout rotation and pan. This removes the previous detail-restoration change in appearance.
- Captures, timing data, reused-baseline provenance, comparison metrics and benchmark script are under `test-results/view006/`. Visually reviewed the mitered corner, enlarged variable-section ring and layer-76 view. Earlier verification entries below describe historical implementations.
- Build and diff whitespace checks passed.

## Unreleased — 2026-11-25 (VIEW-004)

- Camera gestures use 8-sided filament sections and restore the original 16-sided sections once the gesture and inertial motion finish. View presets and plate/error resets restore full detail. A click without camera movement does not schedule an extra render. Line and model-only geometry remain unchanged.
- Bodies, circular sectors and caps each cache compact full/motion geometries. All large per-instance attributes remain shared; switching changes geometry references and synchronizes instance counts instead of rebuilding toolpath buffers. Both geometries are disposed with their owner. The visible and marker-depth passes use the same selected geometry, including when filters or color/render modes change during a gesture.
- Node.js tests: 64 passed. Full Playwright UI suite: passed, including all 15 existing local samples, marker occlusion, dimensions, round joins and zoom. Added numerical checks for halved triangle counts, compact cached templates, unchanged section extrema, shared instance attributes, playback counts, exact full-geometry restoration and disposal. UI instrumentation confirms halved path triangle submission during rotation/pan, restoration after production damping settles, and correct detail when path groups are recreated mid-gesture. The final click-only scheduling refinement passed the focused zoom/motion UI test again.
- Profiled `sample/spool_case_lid.gcode.3mf` with markers ON, 1200 × 850 SwiftShader, fixed pointer gestures with test-only damping disabled and one-pixel readback to wait for rendering. Before values reuse the immediately preceding depth-pass baseline; after values include only frames during the held pointer gesture, excluding the final full-detail restoration frame. The product retains its normal damping. These are synchronized software-render costs, not native VS Code frame-rate guarantees.

| Selection | Rotate median ms, before → after | Pan median ms, before → after | Submitted triangles, full → moving |
| --- | --- | --- | --- |
| Layer 76 only, 32 frames/gesture | 56.1 → 53.9 | 56.8 → 53.2 | 160,236 → 87,532 |
| Layers 1–76, 8 frames/gesture | 5600.8 → 5360.5 | 5598.4 → 5347.4 | 17,823,736 → 9,444,072 |

- Path triangles halve exactly; total triangles fall by about 45–47% because marker geometry is retained. Measured render-time savings are only about 4–6%, rather than proportional to the triangle reduction.
- After gesture completion, all four single/cumulative rotate/pan canvas captures are pixel-identical to the full-detail baseline. Visually reviewed the moving layer-76 view. Captures, timing tables and comparison metrics are under `test-results/view004/`; `before-timings.json` identifies the reused baseline and `after-timings.json` the compact-template implementation. `index-only-timings.json` records an earlier trial and is not the final implementation.
- Build and diff whitespace checks passed. No VSIX packaging or Marketplace publication was performed.

## Unreleased — 2026-11-25 (marker depth-pass experiment)

- Marker occlusion now renders opaque path depth with depth-only materials and disabled color writes. Bead bodies, circular joins and caps reuse their visible vertex-deformation hooks through `src/path-depth.js`; straight lines use a shared depth material with the same face side. Visible materials, excluded-object visibility and the previous render target are restored even if rendering fails. Custom depth materials follow the visible material's disposal; shared fallbacks are released with the occlusion renderer.
- Node.js tests: 63 passed. Full Playwright UI suite: passed, including 15 existing local samples, marker occlusion, dimensions, round joins and zoom controls. The real `16.gcode` marker test reports zero leaks in all four top/angled/zoomed views. Added tests cover depth-program isolation, vertex-deformation retention, material lifetime and render-state restoration on failure.
- Motion profiling uses `sample/spool_case_lid.gcode.3mf`, both layer 76 alone and layers 1–76 cumulatively. SwiftShader at 1200 × 850; test-only damping is disabled to measure fixed rotate/pan gestures. Each timed render waits for GPU completion with a one-pixel readback. These synchronized local render costs include readback overhead and are not native VS Code frame-rate measurements. Production damping is unchanged.
- Baseline marker OFF versus ON (8 frames/gesture): layer 76 rotate 31.3 / 57.9 ms; pan 31.5 / 57.9 ms. Cumulative rotate 3003.5 / 5617.2 ms; pan 3002.5 / 5632.9 ms. Marker occlusion adds a second path render.

| Marker ON selection | Rotate median ms, before → after | Pan median ms, before → after | Samples per gesture |
| --- | --- | --- | --- |
| Layer 76 only, repeated measurement | 56.8 → 56.1 | 57.2 → 56.8 | 32 |
| Layers 1–76 | 5617.2 → 5600.8 | 5632.9 → 5598.4 | 8 |

- The improvement is about 1% or less in these cases; this does not establish a meaningful interaction-speed improvement. Draw counts remain 26 per frame for layer 76 and 46 for the cumulative view. The evidence favors reducing geometry work next rather than further lighting-only changes.
- All four before/after marker-ON rotate/pan canvas captures are pixel-identical. Visually reviewed the layer-76 rotate capture. Authoritative timings: `test-results/motion-depth/before-timings.json`, `after-timings.json`, `before-repeat-timings.json`, `after-repeat-timings.json`; image metrics: `image-comparison.json` in the same directory. Earlier submit-only timing files do not measure GPU completion and are excluded from these conclusions.
- Build and diff whitespace checks passed. No VSIX packaging or Marketplace publication was performed.

## Unreleased — 2026-11-25 (zoom controls)

- Added a toolbar percentage input and −/+ controls. The fitted camera distance is 100%; numeric input commits with Enter or blur, Escape cancels an edit, buttons use a 1.25 factor, and wheel zoom updates the displayed percentage. Rotation, pan, layer changes, playback and display modes retain zoom. Fit/Top/3D presets and newly loaded plates/models reset the reference to 100%.
- Accepted input range is 1–100,000%; positive out-of-range values clamp, and empty/non-finite/non-positive values restore the current percentage. OrbitControls uses the same range, and the far clipping plane expands when zooming out. Loading/error states disable the controls; model-only previews enable them.
- Percentages display and commit as whole numbers, including wheel updates. Ctrl+wheel is normalized before OrbitControls and applies 10× wheel delta exactly once, independently of whether the webview received the Control keydown. Ordinary wheel events retain their existing behavior; OrbitControls internals and dependencies are unchanged.
- The zoom UI regression reproduces both key-event sequences: from 100%, the same Ctrl+wheel event formerly produced 167% without a keydown versus 105% with a keydown. Both now produce 167%, including after rotation, while ordinary wheel gives 105%. Pixel, line and page wheel units are checked for a single acceleration. These are automated event-sequence checks rather than a manual VS Code focus check.
- Node.js tests: 61 passed. Full Playwright UI suite: passed, including all 15 existing local cross-slicer samples, idle rendering, marker occlusion, dimensions and round joins. Added `test/zoom-ui.js` to verify actual visual enlargement, numeric commits, wheel synchronization, rotation/pan, display changes, limits, reset, load/error/model states, Japanese/English labels and 500 px layout.
- Visually reviewed `test-results/zoom/zoom-ja.png`, `zoom-en.png` and `zoom-narrow.png`. README and unreleased changelog describe the controls. Build and diff whitespace checks passed. No VSIX packaging or Marketplace publication was performed.

## Unreleased — 2026-11-25 (VIEW-003)

- Round half-joins now choose 1, 2 or 4 sweep subdivisions from their angle and display width. Reduced subdivisions have at most 0.005 mm chord error and approximately 22.5 degrees per sector; joins needing more detail keep the existing four subdivisions. This is independent of camera zoom. Centerlines, section dimensions, endpoint rings, caps and input files are preserved.
- Cached per-plate directions, bisectors, miter factors, sweep angles, XY normalization and subdivision decisions are reused by color changes and playback. Three instanced groups per category allow different subdivision levels without rebuilding geometry on zoom. The cache adds 42 bytes per source segment (about 24.9 MB for the 592,164-segment sample), released with its plate data; initial loading is not uniformly faster.
- Node.js tests: 61 passed. Full Playwright UI suite: passed, including all 15 local cross-slicer samples, marker occlusion and dimensions checks. Added numerical checks for chord error, shared seam vertices, distinct adjacent detail levels, tiny allowed Z changes, and cached rewrites without repeated angle calculations. UI checks exercise all three detail groups across layer selection and forward/backward playback.
- VIEW-002 versus VIEW-003 images are under `test-results/view003/before/` and `after/`. Visually reviewed the rounded corners, enlarged variable-section ring, mixed-detail layer and `20-3.gcode` layer 10 in top/angled views. Both right-angle canvas images are pixel-identical; the enlarged ring's orange silhouette differs by at most one pixel in this comparison. Full image metrics: `test-results/view003/image-comparison.json`.
- Performance: SwiftShader, 1200 × 850, median of three warm measurements; each input displays its last layer alone. Load/render includes canvas capture. A recolor cycle switches speed → tool → feature; a playback cycle sets progress to 25% → 50% → 100%. Raw results and input hashes: `test-results/view003/benchmark.json`; full-plate subdivision counts: `geometry-stats.json` in the same directory.

| Input | Load/render ms, before → after | Recolor cycle ms, before → after | CPU portion of recolor cycle ms, before → after | Submitted triangles, before → after |
| --- | --- | --- | --- | --- |
| 50,000 straight extrusion segments | 692 → 682 | 1643 → 1555 | 116 → 63 | 1,600,032 → 1,600,032 |
| 1,000 twelve-sided loops | 540 → 409 | 1513 → 1102 | 52 → 31 | 1,920,000 → 768,000 |
| Bambu Studio, 592,164 source segments | 2168 → 2224 | 657 → 602 | 236 → 196 | 11,648 → 11,264 |
| Cura2, 51,147 source segments | 297 → 298 | 407 → 383 | 35 → 30 | 44,832 → 19,680 |
| 20-3, 30,008 source segments | 283 → 261 | 588 → 502 | 28 → 24 | 294,560 → 128,992 |

- The loop case reduces triangles by 60%, load/render time by about 24%, and recolor cycle time by about 27%. These local measurements are not frame-rate guarantees. Build and diff whitespace checks passed; no VSIX packaging or Marketplace publication was performed.

## Unreleased — 2026-11-25 (VIEW-002)

- Planar extrusion bends now use circular outer join sectors centered on the original G-code vertex. Inner joins keep their miters; each segment retains its own width, height and top/bottom Z. Caps match the rounded section at dimension changes, playback boundaries and hidden neighbors. Sloped/vertical paths, effectively straight sections and near reversals retain the existing join.
- Extra instanced sectors are allocated only for eligible bends and follow their owning segment's layer range, playback, category and color. No input G-code, 3MF or print settings are changed.
- Node.js tests: 57 passed. Full Playwright UI suite: passed, including all 15 local cross-slicer samples, marker occlusion and dimensions checks. The additional `test/round-joints-ui.js` checks circular silhouettes in both turn directions, consistent lighting across opposite sweeps, empty playback, category restoration, dimension changes and filtered closed seams. The VIEW-001 renderer fails the new outer-miter-tip assertion; the rounded renderer passes.
- Visually reviewed `test-results/view002/round-corner-before.png`, `round-corner-1.png`, `round-corner-1-iso.png`, `round-corner--1-iso.png`, `round-variable-ring-iso.png` and `round-filtered-seam.png` (all under the same directory). The centerline remains polygonal where the source is polygonal; only the outer joins are rounded.
- Software WebGL/SwiftShader at 1200 × 850, median of three warm loads including canvas capture: 50,000 straight extrusion segments took 671 ms before / 679 ms after, with the same 1,600,032 triangles. A deliberately curve-heavy case of 1,000 twelve-sided loops took 199 / 568 ms, with triangles increasing from 384,000 to 1,920,000. These are local load-and-render measurements, not frame-rate guarantees; densely curved files cost more to draw. Raw results: `test-results/view002/benchmark.json`.
- Build and diff whitespace checks passed. No VSIX packaging or Marketplace publication was performed.

## Unreleased — 2026-11-24 (VIEW-001)

- Fixed small-radius preview joints at width/height changes by sharing the endpoint bisector while preserving each segment's exact section and top/bottom Z. Section caps seal the dimensional step; no input G-code, 3MF or print settings are changed.
- Closed extrusion loops now join their first and last sections within a consecutive run in one layer. Travel moves, tool changes, layer boundaries and separately completed touching loops remain separate. This resolves the closed-loop seam limitation recorded under 0.6.0.
- Node.js tests: 54 passed. Added coverage for section changes at bends, loop seams, touching loops and neighbor boundaries.
- Full Playwright UI suite: passed, including all 15 local cross-slicer samples, playback, category filters, marker occlusion and dimensions checks. A 2 mm radius polygonal ring with alternating 0.7/0.9 mm widths fails the radial-wedge assertion with the original renderer and passes with the fix. Visually reviewed top and angled images: `test-results/tight-radius-before.png`, `test-results/tight-radius-joints.png`, `test-results/tight-radius-joints-iso.png`.
- Build and diff whitespace checks passed. No VSIX packaging or Marketplace publication was performed.

## 0.6.1 — 2026-11-18

- Documentation/version update: README simplified and package/lockfile versions set to 0.6.1. Runtime bundles are byte-identical to the verified 0.6.0 VSIX; runtime tests were not repeated.
- Build and package: passed. VSIX manifest, package and lockfile versions agree. Bundled assets and README/changelog content verified; local samples, source and tests excluded.
- VSIX: `3mf-gcode-preview-0.6.1.vsix`, 22 files, 3,421,786 bytes. SHA-256: `37b4bdb43415ee0d8d7a2e0e71ba951a876053f5463e78fd4c5872e507323e08`. Inventory: `test-results/release-0.6.1.json`.
- Marketplace publication has not been performed. The accepted display limitations and Remote-SSH verification status recorded under 0.6.0 still apply.

## 0.6.0 — 2026-11-18

- Node.js tests: 51 passed with no failures or skips. Coverage includes dimensional tags and estimates, first/adaptive layer pitches, thin ironing, measured spacing, section boundaries, sloped bead height, per-segment lighting reset, Japanese/English translation key and placeholder parity, and localized standalone G-code errors.
- Full Playwright UI suite: passed, including feature/speed/tool filters, playback, layer ranges, saved preferences, Japanese/English views, narrow layouts, model-only files, and 15 local cross-slicer samples. Marker occlusion checks reported zero leaks in top, angled, and zoomed views.
- Dimensions UI: passed for Japanese and English, including slicer-equivalent dimensions, display width and ironing spacing, default/estimated origins, empty playback selection, and localized binary G-code errors. Visually inspected `test-results/dimensions-comparison-en.png`; ironing top/angled fixtures and the real sample layer 10 were reviewed during implementation.
- VS Code Extension Host 1.140.0 / Windows: passed activation, command, Custom Editor, Webview handshake, virtual filesystem reads, and zero input writes, using the existing repository-local VS Code installation.
- VSIX: `3mf-gcode-preview-0.6.0.vsix`, 22 files, 3,421,738 bytes. Version 0.6.0 agrees across package.json, lockfile and VSIX manifest. Bundled JS/CSS, Japanese/English manifest strings and images match the source artifacts; README/changelog content matches with standard vsce link rewriting. Samples, source and test files are excluded. Detailed inventory: `test-results/release-0.6.0.json`.
- VSIX SHA-256: `669b5a93e412e3c50923ee8568bc14e8050ec11bdc6b50a039095e1f973e83f1`.
- Accepted display limitations: ironing width is capped at neighboring path spacing, including central paths; underlying solid fill can show where its surface overlaps ironing at the same path Z; closed-loop first/last joins remain separate end sections. The sample's solid fill and ironing both run at Z 1.040 mm; the temporary Z 1.440 mm move is a travel hop.
- Real Remote-SSH use remains unverified. Marketplace publication, Git commits, tags and pushes have not been performed as part of this preparation.

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
