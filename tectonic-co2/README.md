# Tropical suture length — a tectonic control on weathering

Active suture length in the tropics, reconstructed under every combination of plate model,
activity definition and latitude band the source dataset enumerates — with all of them
drawn at once.

**This page is scoped to that one mechanism, permanently.** It is not a step toward a
page that also draws LIP degassing, continental-arc length or a source-vs-sink synthesis
— those are planned as separate sibling pages instead, each single-driver in this same
style, with a synthesis page bringing them together once they all exist. See
[PLAN.md](PLAN.md) for the reasoning and the family roadmap.

Same family as [../plate-boundaries](../plate-boundaries/), [../zircons](../zircons/) and
[../detrital-zircons](../detrital-zircons/); see those READMEs for anything about the
globe, the shared clock or the collapsible panels not specific to this page.

## Run it

```sh
# from the repo root
python3 -m http.server 8777
# then open http://localhost:8777/tectonic-co2/
```

Drag to pan, scroll to zoom, scrub or press ▶. Click a control to set which value it
highlights — plate model, band and weighting always draw every value at once regardless
of which is clicked; activity definition always draws only the one clicked. Hover a line
in the chart to name it, click to snap the controls to it. **Globe / Map** switches
projection. `#lon,lat,zoom,time` pins the view.

## What the page is for

Two things, and they need different parts of the screen:

**Sensitivity to choices.** "Tropical suture length" is not a measurement. It is the output
of three choices — which plate model puts a suture at a latitude, which tabulated age
interval counts as "active", how wide "tropical" is. All three are enumerated by the source
dataset; one combination got published. Move them and watch the curve move.

**Equifinality.** Several different driver histories are about equally compatible with the
same observations. That claim needs more than one driver, so it is not demonstrated yet —
the sparkline strip that carries it arrives with the second driver.

The page characterises nobody. It reports parameter values, which are matters of record,
and draws the arithmetic.

### What it is not

**Not a fit.** There is no correlation coefficient anywhere. Correlating two heavily
autocorrelated geological series inflates *r* and makes *p* meaningless, and quoting one
would be a flaw of the kind this page exists to expose.

**Not a carbon cycle model.** No source-minus-sink net flux appears, because net flux
without a thermostat is meaningless. There is no minus sign on the page and no affordance
to make one.

## Changing the reconstruction changes the whole map

Selecting a model swaps its **continents, its boundaries and its sutures together** — not
just the suture layer. This is a rule, not a nicety: drawing one model's continents under
another's sutures puts collisions out to sea, and it would make the model control look like
it did less than it does, because most of the map would not move when you used it.

So each model owns its own data:

```
data/<Model>/continents.json      every model
data/<Model>/sutures.json         every model
data/<Model>/boundaries.json      topological models only
data/<Model>/frames/…             topological models only
data/<Model>/velocities.json      topological models only
data/macdonald2019.json           model-independent, published series
data/glaciations.json             model-independent, dated glaciations
```

**Torsvik & Cocks has no topologies**, so no closed plates, so no boundaries and no velocity
field exist for it. Select it and the plate boundaries disappear. That is a capability
difference, not a ranking — it still places a suture at a latitude, which is all this driver
needs — and the page says so rather than borrowing Merdith's boundaries and implying they
belong to CEED.

Every model's layers are advanced on every time change, not just the visible one, so
switching model is an instant swap rather than a reload, and a half-loaded frame can never
appear under a model it does not belong to.

## Two visual languages, and the difference matters

| Object | Encoding | Meaning |
|---|---|---|
| Driver curves | **individual lines** | constructed; each is a real choice somebody could defend |
| Glacial extent | **shaded band** | measured, with a published source |
| Glaciations | **interval bars, fading across each bracket** | dated, with a published bracket |

A translucent hull over the strands would read as a 95% confidence interval to anyone who
has seen one — and the spread here is not an uncertainty, it is a set of alternatives. So
the strands are never filled. Shaded means measured; lines mean constructed.

For the same reason the page says **"choices"** and **"sensitivity"** for anything
reconstructed and reserves **"uncertainty"** for measured quantities with published error.

### Neoproterozoic glaciations

The glacial-extent curve is Macdonald's `IceExtent_Myr.csv` and it **stops at 525 Ma** — so
on an axis reaching 800 Ma the Cryogenian, the most consequential climate interval in the
window, was blank. The glaciations are added as a separate strip rather than folded into
that curve, because they are not the same measurement: one is a continuous ice-margin
latitude, the other is a set of brackets between dated horizons. Drawing the second as a
curve would invent a continuity the geochronology does not have.

Ages are copied verbatim from Hoffman et al. (2017) Table 1, with Gaskiers from Pu et al.
(2016). **Every boundary is a range**, and each is drawn at the real width of its bracket —
solid where the age is pinned, fading out where it is not:

| | onset | termination |
|---|---|---|
| Sturtian | 717.5–716.3 Ma | 659.3–658.5 Ma |
| Marinoan | **649.9–639.0 Ma** | 636.0–634.7 Ma |
| Gaskiers | 580.90 Ma | 579.88 Ma |

Three of the four Cryogenian boundaries are known to a little over 1 Myr and read as hard
edges. The Marinoan onset is loose over **10.9 Myr** and visibly dissolves — it is bracketed
only by a pre-Marinoan Re-Os age of 645.1 ± 4.8 Ma in South Australia and a syn-Marinoan
U-Pb age of 639.3 ± 0.3 Ma from the Ghaub Formation in Namibia. Nothing on the page asserts
that; the bar just looks like what the data is.

**Two admitted distortions.** Across 800 Myr a pixel is roughly 1.5 Myr, so most of those
brackets are narrower than the line drawing them — the numbers are on hover, not measurable
off the strip. And Gaskiers' ~1 Myr duration is sub-pixel, so its bar is widened to a 4 px
minimum to stay findable; its hover says so, and that those two dates bracket the diamictite
rather than dating the glaciation itself.

## The globe is where a parameter becomes concrete

The latitude belt's width **is** the band knob. Sutures render bright inside it, dim
outside, per segment — so a suture crossing the edge is half lit. Drag ±15° → ±40° and
named sutures light up while the curve steps underneath. The reader sees that "±15°" is not
a number, it is a decision about whether a particular collision counts.

**In and out of the band are drawn at the same stroke width.** Only colour encodes the
weight. A thinner line outside the band would say the suture is a smaller feature, when the
only thing that changed is whether the current setting counts it — and the out-of-band alpha
is set high enough that the two genuinely read as equally thick rather than merely being
equal in the code.

**Hover any suture** — in or out of the band — for its name, the blocks either side, all
three age intervals with the one currently in force marked, its latitude span at this time,
how much of its length the current band actually counts, its plate ID in the current model,
and the source's reference.

Under the cosine taper the belt becomes a gradient and the same sutures are drawn at
intermediate opacity, which is the visible form of the argument that the hard edge was
never a physical statement.

**Robinson is the default, not the globe**, and that was decided by measurement: at the
opening time only **64 of 245** active suture vertices fall on the visible hemisphere of an
orthographic globe. For a page about where sutures sit in latitude, hiding three quarters
of them is the wrong default. Robinson also makes the latitude histogram an aligned
marginal rather than a detached summary, because latitude maps to a row of the map.

## Where every range comes from

The page marks each control as *range from source* or *part ours*, and only sourced ranges
feed the bundle by default. A page objecting to unexamined parameter choices cannot quietly
make its own.

| Control | Range source |
|---|---|
| Plate model | frames the source's own attribute table has a plate-ID column for (`PLATEID1`, `PLATEID_CE`) |
| Activity definition | the three intervals the source tabulates, read the two ways its own output directories read them |
| Latitude band ±10/15/20/40° | the source's own output columns |
| Band edge | hard edge is the published choice; **the cosine taper is ours** and is marked |

The band knob snaps to the source's four values rather than sliding freely on purpose: a
free 0–90° slider would make the spread of curves *our* artefact rather than the
literature's.

## Does the arithmetic reproduce the source?

Yes, in the frame the source actually used — **CEED + SHM + Domeier on anchor 1**, exhumation
interval, ±15° (*not* Merdith; see "Which frame the published curve is in" below). The RMS
difference over the whole 0–520 Ma record is **70 km**, against a curve that peaks near 12,000.

The present-day peak alone would be a weak test, because every reconstruction is the identity
at 0 Ma — it checks the tessellation, the spherical segment lengths and the band rule, but
nothing about the rotations. Agreement at 300 and 445 Ma is what tests the reconstruction, and
it is the reason the published curve is worth shipping at all.

It is drawn on the chart as a dashed white line, verbatim, so a reader can see the machinery
land on the source *before* being shown it diverge. Without that, every strand is just this
page's own number.

## Rebuild the data

```sh
conda run -n pygmt17 python build/build_boundaries.py        # boundaries + velocities, 0-800 Ma
conda run -n pygmt17 python build/build_continents.py        # continent polygons
conda run -n pygmt17 python build/build_sutures.py           # the suture layer, per model
python3 build/build_reference_series.py                      # published series, verbatim
python3 build/build_glaciations.py                           # dated glaciations, verbatim
```

`build/models.py` declares the model registry all three build scripts read, so a model
cannot end up with sutures but no continents, or layers built at different time steps.

The first two are the sibling pages' scripts with `TIME_STEP` raised from 1 to **5**. That
is a decision, not a shortcut: 5 Myr is the resolution the inputs are actually at
(Macdonald's suture output is 5 Myr, Cao's arc lengths are 10 Myr bins, GEOCARB is 10 Myr),
and shipping 1 Myr frames would imply a precision the data does not have — on this page of
all pages the wrong implication. It also keeps a model's frames to ~18 MB instead of ~90 MB,
which is what makes carrying more than one model affordable. Cost: playback is slightly
steppier than on the siblings.

`build_reference_series.py` and `build_glaciations.py` need only the standard library.

## Plate-ID validity — the failure this build had to be taught to catch

Asking pygplates for a rotation outside a plate's defined time range does not raise. It
returns the **identity** rotation, so the feature is drawn at its present-day position as
if no reconstruction had happened — on a scrubbing map, a suture teleporting home and
sitting still.

(../detrital-zircons documents this as "holds the oldest pole fixed". Measured here against
Merdith2021's own rotation file, what actually happens outside the range is identity, not a
hold. Same silence, worse result.)

It is not rare here, even with the right column, because a plate's rotation sequence often
does not reach as far back as a suture's activity interval. Under Merdith2021 plate 420 has
no usable chain, so Verkhoyansk (430–0 Ma) is dropped outright, while Bangong is clamped
471–0 → 432–0 Ma and Halmahera 165–0 → 155–0 Ma.

`build_sutures.py` therefore asks pygplates, at each timestep, whether the suture's plate has
an edge in the reconstruction tree built at that time on that anchor. A plate with no path to
the root has no edge, and the suture is skipped for that frame. What is left over is reported
on the page rather than in a log:

| Model | Anchor | Dropped | Clamped | Length reconstructable |
|---|---|---|---|---|
| Merdith2021 | 0 | 1 of 115 | 6 | 99% |
| Torsvik & Cocks 2017 (gprm's file) | 1 (spin axis) | 4 of 115 | 23 | 98% |
| CEED + SHM + Domeier (source's file) | 1 (spin axis) | **0** of 115 | 25 | **100%** |

The two models lose **different** sutures and clamp at different depths. That is a coverage
difference, not a geological one, it lands on the deep-time end of the curve, and the page
reports it so a reader does not read the gap between two curves as a result.

## "Which blocks collided?" is measured, not asserted

The source names the *suture* (Tsangpo, Quetta, Uralian) and cites a reference, but it
records nothing about which blocks collided. That is not something to supply from memory, so
the popup's block line is measured from the reconstruction instead:
`build_sutures.py` samples ~120 km either side of each suture, perpendicular on the sphere,
and asks the model's own continent polygons what is there — reporting each name with the
share of samples that hit it.

The answers are the model's vocabulary, not ours, and they change when the model does. Spot
checks under Merdith2021:

| Suture | Blocks returned |
|---|---|
| Tsangpo | Tethyan Himalayan microcontinent of Greater India (40%), Central Lhasa (16%), West Qiangtang (10%) |
| Bangong | West Qiangtang (25%), Northern Lhasa (22%), Central Lhasa (18%) |
| Uralian | Urals_Peri-Baltic Island arcs (42%), Baltica (26%), Timan Region (11%) |
| Quetta | India (48%), Helmand (Central Afghanistan) (36%), Makran (14%) |

Resolved for 115/115 sutures under Merdith2021, 111/115 under CEED.

**Limitation:** it returns what is within 120 km, which is not always both sides. The
Scandinavian Caledonides come back as Baltica 95% — Laurentia's polygon is not close enough
at present day to register. The popup reports shares so a reader can see when only one side
answered, and says the line is the model's naming rather than the source's.

## Anchor plate — CEED is reconstructed on plate 1, not 0

Which plate a reconstruction is held fixed to is a property of the model, not a control the
reader is offered, so it lives in `build/models.py` next to each model's plate-ID column and
its topology capability. There is deliberately **no anchor menu item**.

Getting it wrong is a mistake rather than an alternative, and this page had it wrong: every
model was exported on anchor 0. For Merdith2021 that is harmless — its 001-relative-to-000
sequence is identity at every sampled time, so anchor 0 and 1 are the same reconstruction. For
**Torsvik & Cocks it is not**:

- CEED's rotation file carries a **29-sample 001-relative-to-000 sequence over 0–600 Ma** about
  an equatorial Euler pole at (0°, 11°E) — −28° at 400 Ma, −55° at 500 Ma — moving
  paleolatitude by up to ~9°. Against a ±10–40° band that moves sutures in and out wholesale.
- **001 is the spin axis** in this model, and 000 is not. That is not inferred from the file's
  structure, which is misleading (plate 701 chains to 000, not to 001) — it is what the source
  itself used: Macdonald's `suture_analysis.ipynb` sets
  `anchor = 1  #anchor plate ID (1 : spin axis)` for every `pygplates.reconstruct` call.
- Direction verified against pygplates' own `anchor_plate_id`: the change is exactly
  `R_001/000(t)⁻¹` applied globally.

What it does to this page's own quantity (CEED, `Ex_max_min`, ±15°), measured:

| time | anchor 0 | anchor 1 |
|---|---|---|
| 0 Ma | 11,844 km | 11,844 km (correction is identity at present day) |
| 300 Ma | 7,091 km | **8,909 km** (+26%) |
| 400 Ma | 948 km | **0 km** |
| 600 Ma | 624 km | **0 km** |

**The anchor also changes what is reconstructable, which is why this is a build-time change
and not a runtime correction.** Reconstructing relative to a non-zero anchor inserts the
anchor's own chain into the circuit, so a plate is usable only where *both* are defined.
Outside its span the anchor rotation quietly becomes the identity too, which would slide the
reconstruction back into the un-anchored frame partway through the record without raising
anything. Because the validity test builds the reconstruction tree *on the anchor*, this falls
out for free: past 600 Ma most CEED plates simply have no edge, and the sutures on them are
skipped rather than silently un-anchored.

Every payload records `anchor_plate_id`, and the page's coverage note reads the frame from the
data rather than restating it, so it cannot claim a frame the data was not built in.

## Plate IDs are the source's, not ours

Worth stating plainly because it is the first thing to doubt: **this page assigns no plate
IDs.** The source's attribute table carries one column per reconstruction frame, and all the
page does is pick which column goes with which rotation model.

| Column | Frame |
|---|---|
| `PLATEID1` | Merdith2021 — what `Suture_Lines_M2021.geojson` exists to add |
| `PLATEID_M` | **Matthews et al. 2016** — "M" is for Mathews, *not* Merdith. Not built; the column is what proves "_M" is not Merdith |
| `PLATEID_CE` | CEED, i.e. Torsvik & Cocks 2017 |

That pairing was established by test rather than by reading the names, after an earlier
version of this page used `PLATEID_M` with Merdith2021 rotations on the assumption that "_M"
meant Merdith. Two independent checks per (column, model) pair: how many sutures have a plate
with no rotation chain at all, and what fraction of suture vertices land on reconstructed
continental crust — a suture is a collision zone welded into continents, so one floating in
open ocean means the ID is wrong for that model.

| | plates absent (of 115) | vertices on continent |
|---|---|---|
| Merdith2021 + `PLATEID1` | **1** | **76.2%** |
| Merdith2021 + `PLATEID_M` | 3 | 71.8% |
| Merdith2021 + `PLATEID_CE` | 19 | 73.1% |
| Torsvik&Cocks + `PLATEID_CE` | **4** | 63.5% |
| Torsvik&Cocks + `PLATEID1` | 12 | 61.7% |

The continent-overlap margins are narrow because these models share most of their plate-ID
conventions; the absent-plate count is the decisive measure, and the two agree. Corroborating
evidence for `PLATEID_M` = Matthews: the source's own directories are `Mathews_Ex_max` and
`CEED_Ex_max`, the paper is from 2019 and so predates Merdith2021, and the column carries
deforming-mesh-style IDs (`28011`, `18103`, `61405`, `2901`) characteristic of that model
generation. `PLATEID1` differs from `PLATEID_M` on 20 of the 115 sutures.

Only Merdith2021 and CEED are built. Matthews2016 is available from the same table and is the
obvious first addition if the model axis is ever worth widening.

### Which frame the published curve is in

**CEED, on anchor plate 1** — the same model and anchor this page ships as `TorsvikCocks2017`.
Every column written to `ice_LIP_suture_lengths.csv` by the source's `suture_analysis.ipynb`
comes from a variable suffixed `_TC17_SHM17_D18`, reconstructed with
`paleogeo_models/TC2017_SHM2017_D2018.rot` and `anchor = 1  #anchor plate ID (1 : spin axis)`.
So the reference thread on the chart is the **CEED** strand's counterpart, not the Merdith one.

That makes the comparison much more informative than a single peak value. Over **0–400 Ma and
480–520 Ma the CEED strand reproduces the published curve essentially exactly** — 1,102 against
1,102 km at 120 and 140 Ma, 2,877 against 2,869 at 240, 1,362 against 1,375 at 280, 8,909
against 8,925 at 300, 1,510 against 1,510 at 480. Same frame, same definition, same band,
agreeing to well under 1% across most of the record. That, not the 0 Ma peak, is the real check
that this page's spherical arithmetic matches the source's.

### "Torsvik & Cocks 2017" is two rotation files

`gprm` distributes `Torsvik_Cocks_HybridRotationFile.rot`. The published analysis ran on
`TC2017_SHM2017_D2018.rot` from the authors' own repository — TC2017 plus **SHM2017 =
Swanson-Hysell & Macdonald** plus Domeier 2018. Both are built here, as separate options.

They are not interchangeable. Measured on anchor 1 at 445 Ma:

| plate | gprm's file | source's file |
|---|---|---|
| 101 Laurentia | −19.1° | −6.5° |
| 303 Avalonia | −4.1° | +8.1° |
| 302 Baltica | +8.7° | +8.7° |

Thirteen degrees of latitude for Laurentia decides whether the Laurentian sutures fall inside a
±15° band during the Late Ordovician. Under gprm's file the page returns 6,317 km at 445 Ma
against the published 11,655 — roughly half. Under the source's file it returns 11,655.

The SHM contribution is **two poles on plate 101, at 444 and 477 Ma**, and the file states in
its own comments what they are for:

```
101 444.0 48.6981 -164.3613 -101.3541 001 !Swanson-Hysell and Macdonald, 2018: keeps Laurentia equatorward of Winterville Volcanics
101 477.0 48.3009 -157.0808 -100.388  001 !Swanson-Hysell and Macdonald, 2018: 5º equatorward of Moretons Harbor data (allowing for Taconic seaway)
```

They are argued from palaeomagnetic data, they are documented, and nothing here is concealed.
They are also an adjustment to the exact quantity the published conclusion turns on — Laurentia's
distance from the equator — made inside the reconstruction that conclusion then cites, at the
times it depends on. Both files ship so a reader can move between them and watch what happens,
rather than be told about it.

### How close does each get?

Against the published `within_15_suture`, RMS difference over 0–520 Ma:

| model | RMS |
|---|---|
| CEED + SHM + Domeier (source's own file) | **70 km** |
| Torsvik & Cocks 2017 (gprm's file) | 1,071 km |
| Merdith et al. 2021 | 1,363 km |

70 km against a curve peaking near 12,000 is a full end-to-end reproduction: same compilation,
same activity rule, same band, same frame, independently recomputed. Everything the page does
downstream rests on that number.

The notebook does also build a second, unpublished series over 0–250 Ma using the Matthews
rotation file. It is not a plate-ID comparison, though: it reconstructs `sutures_CEED_max_min`
— the CEED-plate-ID features — under Matthews rotations, and the variables that were meant to
hold the Matthews-ID features (`sutures_M_max`, `sutures_M_max_min`) are read from the
`CEED_Ex_max/` directories rather than the `Mathews_Ex_max/` ones. It also keeps `anchor = 1`,
which is CEED's convention. Nothing from that series reaches the published CSV, so this does
not affect the curve we ship; it is recorded here only so the `PLATEID_M` column is not
mistaken for something the published analysis exercised.

## Known limitations

- **Activity definitions are not all commensurable, so this page never lets that one
  vary.** `Ex_max` is cumulative — a suture starts counting at exhumation onset and never
  stops — while the other three are moving windows. `Ex_max` at ±40° peaks at ~86,000 km
  against ~12,000 km for `Ex_max_min` at ±15°. Drawn together they would squash the
  windowed strands onto the floor *and* imply the four are alternative estimates of one
  thing, which they are not. So plate model, latitude band and band-edge weighting always
  draw their full enumerated set — that is the page's whole point, a bundle of every
  defensible choice — but activity definition always draws only the one currently
  selected. See that knob's own on-page note for the numbers.
- **One driver, permanently.** This page is tropical suture length and nothing else — not
  a step toward a page that also draws ridge, subduction, continental-arc and rift
  length. Those become separate sibling pages instead, each single-driver in the same
  style; a synthesis page bringing them together is planned last, once they all exist.
- **No CO₂ proxy record.** Glacial extent is the only observation drawn on this page. The
  CO₂ proxy compilation and the Sr curve belong to the eventual synthesis page, not here.
- Subduction-polarity triangles are not drawn in Robinson — inherited from
  ../detrital-zircons' own Robinson overlays, which this page copies. Known simplification.
- Continent polygons include the submerged shelf, so land runs wider than a coastline.
- The latitude histogram is an aligned marginal only in Robinson. Orthographic has no single
  latitude → row mapping, so it falls back to a linear axis and reads as a summary.

## Sources

Sutures, activity intervals, plate-ID assignments, glacial extent (0–525 Ma) and the
published comparison curve: Macdonald, F.A., Swanson-Hysell, N.L., Park, Y., Lisiecki, L. &
Jagoutz, O. (2019), *Arc-continent collisions in the tropics set Earth's climate state*,
**Science** 364, 181–184, as published in the authors' `Arc_Continent_Analysis` repository.

Glaciations older than that record (717–580 Ma): Hoffman et al. (2017), *Science Advances*
3, e1600983, Table 1; Gaskiers from Pu et al. (2016), *Geology* 44, 955–958. A different
quantity from the extent curve above, composed alongside it — see "Neoproterozoic
glaciations" above.

Reconstructions: Merdith et al. (2021); Torsvik & Cocks (2017), CEED, both as gprm
distributes it and as the source's own repository ships it (Swanson-Hysell & Macdonald +
Domeier 2018). Plate-ID assignments for all three are the source's own columns — see above.

Every dataset above is tracked family-wide in
[`../shared/data/registry.json`](../shared/data/registry.json), alongside genuine
alternatives and the choices made turning a source into a curve.

### Further reading

Works that interpret these quantities. **No curve on this page is theirs**, and the numbers
here will not reproduce theirs exactly — the page cites what it actually used.

Macdonald et al. (2019), *Science*; Gernon, Hincks et al. (2021), *Nature Geoscience*;
McKenzie et al. (2016), *Science*; Raymo & Ruddiman (1992), *Nature*; Brune et al. (2017),
*Nature Geoscience*.

## Status

Working and verified live (Playwright) at several times and in both projections: Robinson
and orthographic with antimeridian seams handled, the latitude belt under both band widths
and both edge shapes, per-segment suture shading, the strand bundle with hover/click-to-snap,
the published reference curve, glacial extent, the latitude histogram, and the coverage
report. No console errors in any state exercised.

Only `data/` is gitignored (regenerated by the build scripts above); the rest of this page is
tracked.

---
*Draft prepared with Claude Code.*
