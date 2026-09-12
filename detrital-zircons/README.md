# Detrital zircons — prototype

Detrital zircon samples (Puetz et al. 2026) reconstructed on a rotatable globe,
alongside the same boundaries/continents/velocity arrows as
[../plate-boundaries](../plate-boundaries/) and [../zircons](../zircons/). Each sample is
drawn as a **pie chart**, not a single symbol: wedge size is the share of that sample's
dated grains at a given lag time (grain age minus depositional age), wedge colour is
that lag bin. A 0–1000 Ma series at 1 Myr steps, same as `../zircons`.

This is `../zircons` with its point layer swapped: igneous samples (one colour per rock
type) are gone, detrital samples (one pie per sample) are in. See that page's README, and
`../plate-boundaries`'s, for anything not specific to this layer.

**Method credit**: the lag-time (grain age minus depositional age) approach to zircon
provenance follows Jian et al. (2022), *Journal of Geophysical Research*, building on
Cawood et al. (2012) — with thanks to Dongchuan Jian.

## Run it

```sh
# from the repo root
python3 -m http.server 8777
# then open http://localhost:8777/detrital-zircons/
```

Same controls as the other pages: drag to rotate, scroll to zoom, scrub or press ▶,
click a legend row to toggle boundary types / velocity / the sample layer as a whole,
hover a pie for its detail, click to pin. `#lon,lat,zoom,time` in the URL pins the view.

## Rebuild the data

```sh
conda run -n pygmt17 python build/build_boundaries.py          # boundaries + velocities, 0-1000 Ma
conda run -n pygmt17 python build/build_continents.py          # continent polygons, 0-1000 Ma
conda run -n pygmt17 python build/build_timeseries.py           # boundary length chart
conda run -n pygmt17 python build/build_detrital_zircons.py     # the pie-chart layer
```

The first three are copies of `../zircons`'s own scripts (same model, same range) rather
than shared files or symlinks -- every page in this family is self-contained, so each has
its own `data/`, even where two pages' boundary data happen to be identical.
`build_detrital_zircons.py` is new; see its own docstring for the sample-collapsing and
binning logic.

## Detrital zircons

Source: Puetz et al. (2026), *Geoscience Frontiers*, doi:10.1016/j.gsf.2026.102416, via
`gprm.datasets.Zircons.get_sedimentary_samples(version=2026)` -- ~987,000 individual U-Pb
grain ages across 19,564 samples, one row per grain joined to its sample's site details
(so a sample's site metadata repeats once per grain in the raw table).
`build/build_detrital_zircons.py` collapses that to one row per sample, keyed on
`Ref-Sample Key` (the only column confirmed both unique and internally consistent --
`Sample_ID` alone collides across references, and a handful of values are corrupted into
Excel dates the same way `../zircons/build/build_zircons.py` had to work around).

**Position and lifespan**: a sample's site is reconstructed back to its depositional
age, but unlike `../zircons`'s igneous samples (`lifespan: 'since'`, cumulative from
formation to present) a detrital sample uses `lifespan: 'window'`, `ageWindow: 5` -- it
is only drawn within 5 Myr of its depositional age, then disappears entirely. This page
is about WHEN a rock was deposited, not that it still exists today (the same rule
`../plate-boundaries`'s base metal deposits use), so there is no time that shows
"everything so far" -- only a moving slice through the deposition record. 16,477 of
19,564 samples (84%) have a depositional age of 1000 Ma or younger and appear on this
page at all; the rest are older than Merdith2021's own topology limit and have nowhere
valid to be reconstructed to (same reasoning as `../zircons`'s igneous-age cutoff).

**The pie itself is NOT time-varying.** A sample's lag-time spectrum is a fixed property
of that one rock, not something that changes as the reconstruction scrubs -- only the
sample's *position* (and whether it is currently inside its 5 Myr window at all) moves
with time. The underlying histogram is built once, at build time, in 20 Myr bins of
**lag time -- grain age minus depositional age**, not absolute grain age, from every
dated grain in the sample regardless of whether that grain's raw age falls inside this
page's own 0–1000 Ma range (a grain many hundred Myr older than the rock it ended up in
is the entire point of a provenance spectrum, and lag time is what actually says
something about the sample's source terrane rather than just repeating "old crust exists
here"). Every pie draws at the **same fixed radius** regardless of how many grains a
sample has -- an earlier version scaled radius by grain count, but that made a
thinly-dated sample look like a minor detail next to a heavily-dated one when both are
one sample with equal standing on the map; grain count is still in the popup for a
reader who wants it.

**Each pie is a conic gradient, not a set of flat wedges.** An earlier version drew one
solid-coloured wedge per bin, which read as chunky and banded rather than a smooth
distribution. `drawPieGlyphs()` in `js/pieLayer.js` instead places one colour stop per
non-empty bin, at that bin's cumulative-fraction MIDPOINT -- i.e. it reconstructs the
sample's own empirical CDF of lag time from its binned counts -- and lets the canvas
interpolate every colour in between via `createConicGradient()`. The sweep around the
circle then reads as a continuous gradation from short lag to long lag; the bin width
only sets how many control points that gradation has to work with, not whether it looks
stepped -- the gradient interpolates smoothly between however many stops it gets, so
even the original 100 Myr bins already rendered without banding.

Bin width is now **20 Myr** (`build_detrital_zircons.py`'s `BIN_WIDTH`), narrowed from
100 once the pies became gradients, specifically to sharpen the CDF approximation --
more control points means a transition between two lag-time populations within one
sample sits closer to where the data actually places it, rather than being smeared
across a coarser window. It does not visibly change how smooth a pie *looks* at normal
zoom (that was already fixed by the gradient rendering itself); the effect is on
fidelity, not on banding. A typical sample now has ~21 non-empty bins (was ~10 at
100 Myr; max 107 of 220 possible bins, up from max 32 of 44), and `points.json` grew
modestly, 13.6 MB -> 15.1 MB (15.8 MB with the tectonic-setting classes below added).

Colour comes from `js/pieLayer.js`'s `lagColour()`, a diverging red-white-blue ramp in
the "seismic"/"RdBu" family: red at zero lag, white at 250 Myr, blue from 500 Myr on
(clamped, not extrapolated, so everything from 500 Myr out to the record's longest lag
draws the same saturated blue). A diverging map reads "short lag" and "long lag" as two
opposed colours either side of a neutral middle, rather than implying an ordered hue
sequence the way an earlier rainbow version did. The legend swatch is capped at 65% of
the panel width, not the full column -- an earlier, wider ramp crowded the panel and felt
like it was blocking the globe. The legend's colour bar is generated from the exact same
control points (`lagRampCss()`), so the two cannot drift apart.

## Tectonic setting classes

Each sample's popup also carries two independent tectonic-setting classifications,
computed at build time by **calling gprm's own functions directly** --
`gprm.datasets.Zircons.tectonic_category()` and `.tectonic_fingerprint()` --
rather than reimplementing either method in this repo, so the results stay exactly
consistent with "the Zircons.py" (including whatever quirks already exist in it; this
project did not audit or fix either function, only call it).

- **Cawood (`cawood_class`, A/B/C)**: `Zircons.tectonic_category()`, following Cawood et
  al. (2012), thresholds the same lag-time CDF this page's pies already visualise (short
  lag concentrated near the fast end of the CDF vs. spread across it). Distribution
  across the 16,477 samples on this page: A 8,927, C 4,510, B 3,040. A fixed
  classification, no free parameter.
- **Barham (`barham_ratio`)**: `Zircons.tectonic_fingerprint()`, following Barham et al.
  (2022, *EPSL*), itself returns two continuous statistics (`chi_square`, `percentile`)
  rather than a class -- this page ships their ratio (`percentile / chi_square`)
  unclassified, and `js/story.js` thresholds it live (see below) rather than baking one
  split in at build time. 20 -- the split from the user's own classification-comparison
  notebook (`~/GIT/zircons/zircon_class_comparison.ipynb`) -- is only the slider's
  starting position. A sample with fewer than 2 dated grains has no defined ratio at all
  (107 of 16,477 samples, `null`) rather than defaulting to a class as if the statistic
  existed.

**Colour by class, not just lag time.** Three pill buttons above the age ramp ("Lag
time" / "Cawood" / "Barham") switch what a pie's fill means, wired in
`js/story.js`'s `buildColourModeControl()` and drawn by `js/pieLayer.js`'s
`drawPieGlyphs(..., { mode })`. Lag time keeps the conic-gradient spectrum described
above; Cawood and Barham instead paint the WHOLE pie one flat colour for that sample's
class (a class is one categorical value per sample, there is nothing to sweep a
gradient across) and swap the age ramp for a small legend of class swatches + counts
(over the whole 16,477-sample dataset, not just samples currently in their 5 Myr
window -- a class doesn't depend on time, so a live count would only be reporting on
the window, not the classification). Selecting Barham also reveals a threshold slider
(1-100, default 20); dragging it reclassifies every pie AND the class-legend counts AND
the hover/pin popup's own Barham row live, all from the one `barham_ratio` shipped in
`points.json` -- nothing is recomputed server-side. A sample with no defined class
(Barham's 107 sub-2-grain samples) draws in a neutral grey rather than being silently
dropped from the layer.

## Why a custom pie layer, not the deposit/zircon symbol renderer

`deep-time-map`'s `PointLayer` (`js/points.js` in the vendored submodule) draws one fixed
symbol per point -- a circle, square, etc. -- with a single fill colour. That is the right
model for "this deposit is copper" or "this zircon is felsic", but a detrital sample is
not one thing, it is a distribution, and no amount of styling one point turns it into a
gradient-filled glyph.

Rather than change the vendored library for this one page, `js/story.js` loads the
samples into an ordinary `PointLayer` with every default symbol made fully transparent
(`size`, `fill` and `keyline` all effectively invisible in the `SAMPLE_STYLE` options).
That still gets position tracking through plate rotation, hover/pick, and spiderfy
clustering entirely for free from the library, unmodified. `js/pieLayer.js`'s
`drawPieGlyphs()` then runs as a second canvas overlay, immediately after the point
layer's own (invisible) draw call in the same frame, and reads the exact same
`_screen`/`_live` arrays that call just populated -- the same reach into
private-by-convention fields `../zircons`' now-removed density overlay used, justified
the same way: there is no public API for "where did you just draw this point", and
`_screen` is the only place that answer lives. Because pies are read from the position a
spiderfy fan has *already* displaced them to, a fanned cluster's pies land precisely on
its leader lines with no extra bookkeeping in `pieLayer.js` at all.

`hitRadius` and `clusterRadius` are widened past the library's point-sized defaults (to
12 / 20 px, a little past the fixed pie radius of 7px) so hover and spiderfy react to the
whole visible disc, not just a few invisible pixels at each pie's centre.

## Known caveats

Same as `../zircons`: continent polygons include the submerged shelf, so land runs wider
than a coastline; the globe is a flat ocean disc with vector land on it, not a
paleogeographic reconstruction. A sample's popup shows a **reference key** (e.g.
`R13007`), not a full citation -- the compilation carries a reference code column, not a
bibliography table, so there is nothing further to look up without a separate reference
list this build does not yet load. Because of the 5 Myr window, live sample counts vary
enormously with time -- a few thousand near 0 Ma (recent river/desert sands are heavily
sampled) down to a handful in quieter stretches of deep time -- which is the intended
behaviour, not a bug: the map is showing the deposition record's own unevenness.

Not built (explicitly out of scope for this pass, not merely deferred): an aggregate
lag-time histogram akin to `../zircons`'s crystallisation-age chart. That page's
histogram fits neatly because igneous crystallisation ages share the same 0–1000 Ma axis
as the reconstruction slider; lag times here run to 4400 Myr, a different axis entirely,
so a combined-record chart would need a second, independent axis rather than reusing the
slider's own -- a bigger change than this pass attempted.

Both the legend and the timebar can be **collapsed** to a small round toggle button
(top-right corner of the legend, right end of the timebar) via the same `.panel-toggle`/
`.is-collapsed` pattern in both `css/story.css` and `js/story.js`'s `attachCollapse()` --
useful on any window, but specifically fixes the legend swallowing most of the screen on
a narrow one: below 900px wide the legend's max-height is now capped at 42vh (was
effectively the full desktop cap of `calc(100vh - 9rem)`, which on a narrow-but-tall
window left almost no globe visible even before this section existed).

## Globe / Robinson projection toggle

The button top-right (`#projection-toggle`) switches the whole page between the
rotatable orthographic globe and a flat, pannable **Robinson projection**, via a new
`Globe.setProjection()` in the *shared* `shared/js/globe.js` -- available to every page
in this family, not just this one. Robinson has no camera or horizon, only a central
meridian (dragging pans it; scroll-to-zoom is unchanged; vertical drag has no effect,
since Robinson has no tilt) -- this needed no changes to this page's own drag handler,
since it already just adjusts `view.lon`/`view.lat` and lets `Globe.render()` decide
what to do with them per projection.

Robinson has no closed-form inverse, so `shared/js/globe.js`'s new `ROBINSON_FRAG`
WebGL shader inverts the same published Robinson scale-factor table (Snyder 1993, also
`shared/js/geo.js`'s `ROBINSON_TABLE`) per pixel via a 19-row lookup + linear
interpolation, rather than a formula -- this is genuine raster reprojection, ready for
any page that loads real paleogeography textures via `Globe.loadTextures()`. This page
does not (its ocean is a flat vector fill, its continents a vector `PolygonLayer`), so
in practice the shader draws nothing here either way -- the Robinson-shaped ocean
outline visible on this page comes from `js/story.js`'s own `traceRobinsonOutline()`,
which traces the boundary with `globe.project()` instead.

The sample pies project through `globe.projector`/`globe.project()` unchanged in either
mode -- a pie glyph is a single point, so an independent per-point wrap near the seam
can only flip which side it renders on for one frame, never stretch a shape across the
map. Velocity arrows are NOT exempt, despite being short (a few degrees of arc at
most): a first pass assumed they were too small to ever straddle the seam and left them
on the same unchanged path, but a two-point segment with its base on one side of the
seam and its tip on the other still gets each end independently wrapped by
`Globe.project()`, so the "short hop" becomes a line stretching across the whole map --
reported directly ("the dateline wrapping issue makes it horrible... for the vector
arrows there are still many instances"). Fixed the same way as the continents/boundary
bug, but without needing the full ring/line clip (an arrow is only ever two points, so
there is nothing to clip): `js/story.js`'s `drawVelocitiesRobinson()` reconstructs the
tip's delta relative to the base's own wrapped delta (`baseDelta + wrapLon(tipLon -
baseLon)`, never re-wrapped independently) and projects both ends with
`Globe.projectDelta()`. Verified with a pixel-level scan across a 40-frame scrub (no
row of the canvas contains a long run of arrow-coloured pixels) and visually at the same
four dateline-adjacent central meridians used for the continents/boundaries fix.
Continents and boundaries are NOT drawn through the vendored
`PolygonLayer`/`BoundarySeries` in Robinson mode, though: a filled continent or a long
boundary segment CAN cross the seam, and a first pass of this feature shipped with
exactly that bug -- any ring or line straddling the current central meridian's
antimeridian drew a spurious seam clear across the map (the sibling Geode project's own
first flat-map mode, Plate Carree/ADR-0003, had deferred this same problem rather than
solving it, for reference). Fixed properly,
not worked around: `shared/vendor/d3-geo-clip/` is a trimmed, dependency-free port of
[d3-geo](https://github.com/d3/d3-geo)'s antimeridian clip-and-rejoin algorithm -- the
standard, widely-used solution to this exact problem (also what d3-geo-projection's own
Robinson implementation is built on) -- and `shared/js/robinsonSeams.js` is the small
adapter that feeds this page's own already-reconstructed ring/line coordinates through
it. `js/story.js`'s `drawContinentsRobinson()`/`drawBoundariesRobinson()` read
`PolygonLayer`/`BoundaryLayer`'s own already-reconstructed `xyz`/ring-or-feature
metadata from outside those vendored classes (the same reach-in-and-parallel-draw
pattern `js/pieLayer.js` already uses for `PointLayer`, not a change to either vendored
file), split each ring/line at the seam, and project the resulting pieces with
`Globe.projectDelta()` -- a new method that takes an already-safe longitude delta
instead of an absolute longitude, since re-deriving and re-wrapping the delta from an
absolute longitude is exactly what reintroduces the seam (see that method's own
comment). Verified against the real dateline: centred directly over Siberia/Alaska,
which genuinely straddles it, the landmass and its boundary lines render as one
continuous shape with no seam, at several nearby central meridians (180, -180, 170,
-170). Subduction-polarity triangles are not drawn on boundaries in Robinson mode --
`BoundaryLayer`'s own triangle placement is tied to its internal `tracePolyline()` call
in a way not easily reused against a seam-split line for a decorative detail; a
deliberate simplification, not an oversight.

A second, unrelated bug surfaced after the fix above shipped: panning through certain
central meridians made Antarctica briefly flash a huge, wrongly-shaped fill. Root cause:
`continents.json`'s "East Antarctica" ring includes an explicit vertex pair sitting
exactly at the South Pole (apparently a topology-closure artefact of the GPlates
reconstruction) -- longitude is undefined at a pole, and that coordinate singularity
made the clip's antimeridian cut-point bookkeeping numerically unstable as the central
meridian swept past certain values (confirmed with a fine-grained sweep: 204 spurious
changes in output shape across a full rotation, several of them rapid flips within a
fraction of a degree -- exactly the reported flashing). The fix is not a new algorithm:
`robinsonSeams.js` now drops any vertex within 1e-4 degrees of a pole before clipping,
since the antimeridian clip already has dedicated, correct handling for a ring that
merely passes *near* a pole between two ordinary vertices (the standard input shape it
expects), and the explicit pole vertex was redundant with that. Re-running the same
sweep after the fix showed 3 changes, all one smooth transition as the seam crosses a
real vertex -- matching the behaviour of every other (non-pole-touching) ring in the
dataset. Verified against the live page too: instrumenting the canvas to track the
on-screen width of the continents fill path while dragging back and forth through the
exact previously-unstable range showed a tight, consistent width with no outliers.

## Status

Working: reconstructed continents, boundaries, velocity arrows and the pie-chart sample
layer with its 5 Myr depositional-age window, verified visually (Playwright) at several
times and zoom levels, including a fanned spiderfy cluster, hover/pin popups with correct
lag-time and tectonic-class detail, live counts that track the window correctly across
separate page loads (2634 samples at 0 Ma, 354 at 100 Ma, 13 at 842 Ma -- matching an
independent count straight from points.json), uniform pie size, the narrower colour-ramp
legend, collapsible legend/timebar panels on both narrow and wide windows, and no
console errors during sustained playback. The three colour-by-class modes were each
verified with a screenshot and by reading pixel colours back off the canvas: Cawood's
three flat colours and legend counts (8,927/3,040/4,510) match the distribution above
exactly; Barham's at the default threshold (8,674/7,696/107) likewise; moving the
threshold slider to 5 live-recomputed both the map and the legend counts (5,610/10,760/
107) and the hover popup's own Barham row picked up the new threshold immediately.

The globe/Robinson toggle was verified the same way: switching projection, dragging to
pan the central meridian, scroll-zooming, and switching back all produced zero console
errors and the expected screenshots (continents, boundaries and pies all correctly
reprojected, oval Robinson outline, arrow field covering the whole world rather than
one hemisphere since Robinson has no horizon to cull against); a hovered pie's popup
still opened correctly in Robinson mode, with the right sample's detail. The
antimeridian fix was verified separately and specifically: centred directly over the
real dateline at several nearby central meridians (180, -180, 170, -170), over the one
landmass that actually straddles it (Siberia/Alaska) -- continent fill and boundary
lines both render as one continuous shape with no seam. A scrub-through-time
performance check in Robinson mode (60 frames) averaged 18.97ms/frame against 16.86ms
in orthographic mode over the same scrub -- a modest, expected overhead from the
per-ring lon/lat conversion and seam check, not a concern for a prototype. The velocity
arrow fix was verified the same way, plus a pixel scan across a 40-frame scrub at the
worst-case central meridian (180) for any long run of arrow-coloured pixels in a single
canvas row -- none found.

Only `data/` is gitignored (regenerated by the build scripts above); the rest of this
page (this README, `build/`, `css/`, `index.html`, `js/`) is tracked.

---
*Draft prepared with Claude Code.*
