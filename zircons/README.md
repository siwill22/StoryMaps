# Igneous zircons — prototype

Mafic and felsic igneous zircon samples (Puetz et al. 2026) reconstructed on a rotatable
globe, alongside the same boundaries/continents/velocity arrows as
[../plate-boundaries](../plate-boundaries/). A 0–1000 Ma series at 1 Myr steps — the full
span Merdith2021's topologies support, not the 250 Ma the old Scotese raster used to cap
plate-boundaries at (that raster is gone from both pages now).

This is plate-boundaries with one layer swapped: the base metal deposits are gone,
igneous zircon samples are in. See that page's README for anything not specific to the
zircon layer, which is documented here instead.

**Method credit**: the lag-time provenance method used on the companion
[../detrital-zircons](../detrital-zircons/) page follows Jian et al. (2022), *Journal of
Geophysical Research* — with thanks to Dongchuan Jian.

## Run it

```sh
# from the repo root
python3 -m http.server 8777
# then open http://localhost:8777/zircons/
```

Same controls as plate-boundaries: drag to rotate, scroll to zoom, scrub or press ▶,
click legend rows to toggle boundary types / velocity / rock type, hover a zircon for its
detail, click to pin. `#lon,lat,zoom,time` in the URL pins the view.

## Rebuild the data

```sh
conda run -n pygmt17 python build/build_boundaries.py         # boundaries + velocities, 0-1000 Ma
conda run -n pygmt17 python build/build_continents.py         # continent polygons, 0-1000 Ma
conda run -n pygmt17 python build/build_timeseries.py          # boundary length chart
conda run -n pygmt17 python build/build_zircons.py             # the zircon layer
python3 build/build_zircon_histogram.py                        # zircon age histogram chart
```

The first three are plate-boundaries' own scripts with `END_TIME` raised from 250 to
1000 -- see each script's docstring. `build_zircons.py` and `build_zircon_histogram.py`
are new; the histogram script needs only `data/points.json` (from `build_zircons.py`) and
the standard library, so it runs under plain `python3`, no conda env required -- it is
listed last because it depends on that file existing.

## Igneous zircons

Source: Puetz et al. (2026), *Geoscience Frontiers*, doi:10.1016/j.gsf.2026.102416, via
`gprm.datasets.Zircons.get_mafic_felsic_samples()` -- two sheets, mafic and felsic, from
that paper's mafic/felsic igneous zircon compilation. 24,519 samples total; 14,167 have a
magmatic/crystallisation age of 1000 Ma or younger and appear on this page (see
`build/build_zircons.py`'s docstring for why the rest are excluded at build time rather
than shipped and never shown).

**A sample is shown from its crystallisation age to the present, bright within 5 Myr of
that age and faint outside it.** This is a different display rule from plate-boundaries'
deposits, which use `lifespan: 'window'` to disappear entirely outside +-5 Myr. A zircon
sample is part of a rock that does not stop existing once it has formed, so it uses the
library's default `lifespan: 'since'` instead (drawn for every time from formation to
0 Ma) with the age window driving *colour* rather than *visibility* -- implemented as a
`style` hook re-evaluated by calling `zircons.restyle()` on every time change, reading the
page's own `time` variable, rather than anything baked into the export. Scrubbing toward
the present therefore shows crust visibly accumulating: a sparse globe near 1000 Ma, a
travelling band of bright, newly-formed samples, and an ever-growing faint background of
everything that formed earlier and is still there to be sampled today.

Felsic gets a warm pink, mafic a green -- a loose association with the rock's own colour
(felsic = pale, mafic = dark), not an arbitrary pairing, and chosen to sit clear of the
boundary line colours and the velocity arrows the same way plate-boundaries' commodity
families were.

Only the rotations transport is written (see `deep_time_map.points` for the two
transports and the crossover between them) -- with 14,167 points on 302 plates,
`effective_points` is already far past the point where rotations wins, so there was
nothing to learn from also building the trajectory file the way plate-boundaries does for
its own comparison.

## Time series chart

Two rows, sharing the slider's clock: **Subduction** (boundary length, unchanged from
plate-boundaries) and **Zircons formed / 20 Myr**, a histogram of crystallisation ages
across the full record. Ridge and transform length were dropped -- this page is about the
zircon record, subduction alone is enough boundary context, and a third/fourth row just
crowded the panel.

The histogram is a **fixed distribution**, not something that redraws as the
reconstruction age scrubs -- it answers "how much zircon-forming magmatism happened at
each age across the whole record", independent of which single time the globe currently
shows. The shared time marker (the chart's 'shade' mode, same as the subduction row) marks
where the current time sits within it. `build/build_zircon_histogram.py` bins
`data/points.json`'s own `age` values into 20 Myr bins, 0-1000 Ma -- the same values the
globe reconstructs, not a re-fetch of the raw compilation -- and writes
`data/zircon_histogram.csv`.

It is drawn as a **line chart**, not bars: `deep-time-map`'s `TimeSeriesSet` only strokes
paths, no rectangle-fill mode exists. Rather than extend the vendored library for one
page, each bin is written as two CSV rows sharing its start/end times with the same count,
so consecutive bins meet at a shared time value with two different counts -- the
line renderer draws that as a flat plateau across the bin and a near-vertical riser at
the boundary, which reads as a step histogram without any new rendering code.

## Known caveats

Same as plate-boundaries: continent polygons include the submerged shelf, so land runs
wider than a coastline; the globe is a flat ocean disc with vector land on it, not a
paleogeographic reconstruction. A handful (4, all Felsic) of `Sample_ID` values were
already corrupted into Excel dates upstream of `gprm` -- e.g. a code that read as "3-1"
auto-converted to a date by the spreadsheet itself -- and are stringified as ISO dates by
`build_zircons.py` rather than crashing the export; the original text is not recoverable
from the published spreadsheet.

Both the legend and the timebar can be **collapsed** to a small round toggle button
(top-right corner of the legend, right end of the timebar) via the same `.panel-toggle`/
`.is-collapsed` pattern in both `css/story.css` and `js/story.js`'s `attachCollapse()` --
useful on any window, but specifically fixes the legend swallowing most of the screen on
a narrow one: below 900px wide the legend's max-height is now capped at 42vh (was
effectively the full desktop cap of `calc(100vh - 9rem)`, which on a narrow-but-tall
window left almost no globe visible even before this section existed).

## Status

Working: reconstructed continents, boundaries, velocity arrows and the zircon layer with
its bright/faint display rule, verified visually (Playwright) at several times, with
hover/pin popups, per-type legend toggles, collapsible legend/timebar panels, and
playback all confirmed live.

Only `data/` is gitignored (regenerated by the build scripts above); the rest of this
page (this README, `build/`, `css/`, `index.html`, `js/`) is tracked.

---
*Draft prepared with Claude Code.*
