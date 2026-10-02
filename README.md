# 3MF G-code Preview

Preview sliced 3MF files in VS Code. Explore the model, inspect toolpaths layer by layer, and play through the order in which paths are printed. The viewer is read-only and never changes your 3MF file.

## Install and open

In VS Code, open the Extensions view, search for `3MF G-code Preview`, and install it from the Marketplace. Then open a `.gcode.3mf` or `.3mf` file. If another editor opens it, choose Reopen Editor With… and select 3MF G-code Preview.

You can also run `3MF G-code Preview: Open 3MF` from the Command Palette.

For a toolpath preview, the 3MF must contain sliced G-code. In Bambu Studio, **Export plate sliced file** creates this kind of file. A 3MF project without G-code can show its model geometry, but this extension cannot slice it.

## Explore a print

- **Choose layers:** Drag the two handles on the vertical slider to show a range, enter layer numbers, or switch to a single layer.
- **Follow the print order:** Step through or play the selected layers. Completed paths remain visible as playback builds the preview.
- **Inspect paths:** Color and filter by path type, speed, or tool. Show or hide travel moves separately, and switch between filament-style paths and center lines.
- **Find print actions:** Show markers for retraction, unretraction, wipes, and the start of outer-wall paths.
- **See the file structure:** Open the plate, object, and part tree over the viewer. The tree is for inspection; it does not edit parts or control their visibility.
- **Check time estimates:** View model and total print times when the slicer included them in the file.

The interface follows the VS Code display language: Japanese for Japanese locales and English otherwise. Names stored in the 3MF stay as written in the file.

## What to expect

The viewer draws a preview from the file's model and G-code. Filament-style paths approximate deposited material; they are not a measurement of the finished print. Print times come from the slicer's estimates. Action markers are derived from G-code and may differ from printer behavior. The viewer does not determine seam positions or simulate firmware-specific commands.

Large or unsupported files may show an error. Warnings that affect the preview remain visible; routine notices about printer-specific commands are hidden. The extension does not send a job to a printer or start a print.

## Support

Report bugs or request features through the [GitHub issue tracker](https://github.com/mm-lab-dev/3mf-gcode-preview/issues). See [Support](SUPPORT.md) for what to include in a report.

This is an unofficial project and is not affiliated with or endorsed by Bambu Lab. Licensed under the [MIT License](LICENSE).
