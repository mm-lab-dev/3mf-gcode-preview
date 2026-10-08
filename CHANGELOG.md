# Changelog

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
