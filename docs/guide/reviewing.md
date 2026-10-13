# Reviewing changes

- **Views:** side by side (scrolling together), slider, overlay (fade between before and after) and diff. Zoom fits large screenshots to the page or shows them at 25–400 %.
- **Keyboard:** `J`/`K` next/previous snapshot, `1`–`4` views, `A` accept, `R` reject, `Z` zoom, `I` ignore regions, `C` comment, `?` all shortcuts.
- **Comments** on every snapshot — written by reviewers, read by everyone in the project.
- **Ignore regions and threshold** (*Ignore regions*, reviewers): drag rectangles over areas whose changes don't count — dates, animations, ads — and set the share of pixels that may change. They apply to the snapshot name in every later run of the project and suite, and open changes are checked again right away: a change that no longer counts becomes `unchanged`, and the commit status turns green without re-running CI. Size changes always count. Changes within the threshold keep their image and diff, so you can see what was tolerated.

## Edge pixels (anti-aliasing)

Browsers blend the pixels along edges — of rounded corners, borders, shadows and text — with the background. Small geometry changes only alter these blended pixels: a corner radius going from `6px` to `8px` changes a few dozen pixels in the corners and nothing else. optik counts them like any other changed pixel, so such changes need review.

- In the **diff image**, changed edge pixels are **yellow**, all other changed pixels **red**. A diff with only yellow pixels is a change in shape or position by a pixel or less.
- They are part of the share of changed pixels, so the **threshold** covers them too.
- Screenshots taken with the same browser in the same environment — in particular with the [rendering container](/adapters/renderer) — are pixel-identical from run to run, so edge pixels don't cause false changes. If yours come from machines whose edge blending varies (different GPUs, operating systems or font settings without the rendering container), turn on *Ignore changed edge pixels* under *Project → Settings*: they are then still shown in yellow, but don't count. Small changes like the corner radius above then go unnoticed — prefer the rendering container where you can.
