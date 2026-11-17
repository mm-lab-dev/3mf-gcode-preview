# Changelog

## 0.6.1 — 2026-11-18

- Shorten the README to focus on viewer controls, displayed information, and practical limitations.

## 0.6.0 — 2026-11-18

- Show path Z, layer pitch, deposited Z bounds, width, and bead height for the selected layers, plus dimensions and their specified, estimated, or default origins at the current playback position.
- Honor slicer width and height comments, preserve thin ironing sections at the same path Z, and improve dimensional estimates for missing tags, adaptive layers, and volumetric extrusion.
- Distinguish ironing display width and path spacing from the slicer's equivalent extrusion section. Estimate spacing from nearby paths, with the file setting as a fallback, and improve thin-pass shading without increasing physical thickness.
- Preserve section dimensions across width, height, and tool changes, and keep bead height vertical on sloped paths.
- Complete Japanese translations for input-size, binary G-code, and feature-name-limit errors, and verify the added dimension labels in English.

## 0.5.0 — 2026-11-16

- Make the action-marker and toolpath lists independently expandable, and save their open/closed states.
- Add a saved Current path position toggle so the white cursor can be hidden with the other markers.
- Show action markers across the selected layer range up to the current path position, preserving side-view inspection. Keep markers round and use a toolpath depth mask to hide only portions overlapped by foreground paths in other layers.
- Correct marker masking in angled views and improve depth precision for thin layers, including when zooming.
- Draw wipes as thin continuous yellow strokes along their actual motion paths instead of a sphere at every move.

## 0.4.0 — 2026-11-15

- Open standalone text G-code files alongside sliced 3MF files.
- Expand cross-slicer feature colors to distinguish overhang walls, support interfaces, floating vertical shells, ironing, prime towers, and gap infill.
- Show original slicer feature names in legend tooltips and path details; keep unknown names under Other.
- List only feature types, extrusion-speed bands, and action markers present in the selected plate. Keep visibility controls available across layer selection and playback, and preserve preferences across files.
- Provide Japanese and English labels for the added categories and use distinct gray shades for prime towers and Other paths.
- Update the extension description and README for G-code support.

## 0.3.0 — 2026-10-08

- Add a project-rooted structure tree with a parameter table for the selected project, plate, object, or part.
- Show settings and metadata from Bambu-style project, model, and slice configuration files and the main 3MF model, grouped by source.
- Filter the selected item's parameters by keyword and retain the search term when selecting another tree item. Keep shared object settings available from each plate while associating instance settings with their plate.
- Provide Japanese and English labels for the new view and update the README screenshot.

## 0.2.2 — 2026-10-05

- Save display preferences across files and synchronize changes between open previews. Layer range and playback position remain specific to each preview.
- Move the layer-range slider beside the settings panel and extend it to the height of the preview area.
- Keep the 3D grid spacing fixed at 10 mm, regardless of model size.
- Add screenshots showing layer selection, path rendering, and file structure to the README.

## 0.2.1 — 2026-10-03

- Rename the custom editor ID to `3mfGcodePreview.editor` and the open command ID to `3mfGcodePreview.open`.
- If you assigned `*.3mf` to the previous `layerViewer.3mf` ID or bound the previous `layerViewer.open` command, update your VS Code settings or keybindings to use the new IDs.

## 0.2.0 — 2026-10-03

Initial release.

- Preview sliced `.gcode.3mf` toolpaths and model-only `.3mf` files in a read-only VS Code editor.
- Inspect layer ranges, cumulative path playback, print-time estimates, action markers, and plate/object/part structure.
- Switch between filament-style and line rendering, with feature, speed, and tool colors and visibility controls.
- Use the viewer in Japanese or English according to the VS Code display language.
