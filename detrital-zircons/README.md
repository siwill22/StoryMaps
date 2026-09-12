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
  across the 16,477 samples on this page: A 8,927, C 4,510, B 3,040.
- **Barham (`barham_class`, A/B)**: `Zircons.tectonic_fingerprint()`, following Barham et
  al. (2022, *EPSL*), itself returns two continuous statistics (`chi_square`,
  `percentile`) rather than a class -- the A/B split used here (`percentile /
  chi_square > 20` -> `'B'`, else `'A'`) is the threshold from the user's own
  classification-comparison notebook (`~/GIT/zircons/zircon_class_comparison.ipynb`),
  not invented for this page. A sample with fewer than 2 dated grains has no defined
  fingerprint and is left with no `barham_class` at all (107 of 16,477 samples) rather
  than defaulting it to 'A' as if the statistic existed. Distribution among the rest: A
  8,674, B 7,696.

Both classes are display-only for now -- they appear in the hover/pin popup
(`js/story.js`'s `POPUP_ROWS`) but do not drive any visual encoding of their own (no
outline colour, no filter). Wedge colour and position are still entirely the lag-time
pie described above; a reader who wants to see WHERE the "A" samples cluster currently
has to click through them one at a time.

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

## Status

Working: reconstructed continents, boundaries, velocity arrows and the pie-chart sample
layer with its 5 Myr depositional-age window, verified visually (Playwright) at several
times and zoom levels, including a fanned spiderfy cluster, hover/pin popups with correct
lag-time and tectonic-class detail, live counts that track the window correctly across
separate page loads (2634 samples at 0 Ma, 354 at 100 Ma, 13 at 842 Ma -- matching an
independent count straight from points.json), uniform pie size, the narrower colour-ramp
legend, collapsible legend/timebar panels on both narrow and wide windows, and no
console errors during sustained playback.

Only `data/` is gitignored (regenerated by the build scripts above); the rest of this
page (this README, `build/`, `css/`, `index.html`, `js/`) is tracked.

---
*Draft prepared with Claude Code.*
