# tectonic-co2 — plan

A sibling page in the StoryMaps family (`plate-boundaries` → `zircons` → `detrital-zircons` →
this), about **one** tectonic control on atmospheric CO₂: tropical suture length, i.e.
weatherability via suture erosion.

Self-contained `build/ css/ js/ data/`, reusing `shared/js/globe.js` (orthographic + Robinson)
and the vendored `deep-time-map`. Not a Geode viewer.

**Scope decision, superseding everything below that reads otherwise:** this page stays
single-driver, permanently. It was originally scoped as a "walking skeleton" for a page that
would go on to draw ridge length, subduction length, continental-arc length and rift length
too — sections 6 and 12 below still describe that plan and are kept for their reasoning, but
it will not happen *on this page*. Instead:

- **LIP degassing** and **continental-arc length** each become their own sibling page, in this
  same knob-driven style. Whether the LIP page reuses or replaces the existing `../lips` page
  (a different, scroll-driven page about LIP area vs. extinction/glaciation) is **not decided**.
- A **synthesis page**, built last once the single-driver pages exist, is where source and sink
  sides actually meet — the CO₂ proxy compilation, the Sr curve, and any cross-driver comparison
  belong there, not here.

Every dataset this page uses is tracked family-wide, alongside genuine alternatives, in
[`../shared/data/registry.json`](../shared/data/registry.json) — check there before a sibling
page duplicates something this one already built.

---

## 1. What the page is for

Two claims, and they need different machinery:

**Equifinality.** Several different driver histories are about equally compatible with the same
observations. You cannot pick the winner by eye, and the papers that pick one are picking on
grounds the record does not supply.

**Sensitivity to choices.** Any single driver's contribution moves a lot under a defensible
re-quantification. *How much continental arc was near the equator?* is not a number. It is a
function of how you asked — which plate model, which latitude band, which activity definition,
which smoothing.

The yardstick is Gernon-style driver comparison without box models (Gernon, Hincks et al. 2021),
working under the same limitations, with one difference: the choice space is exposed rather than
collapsed to one line.

### What it is not

Not a fit. There is no correlation coefficient and no goodness-of-fit score anywhere on the page.
Correlating two heavily autocorrelated geological series inflates *r* and makes *p* meaningless,
and quoting one would be a flaw of exactly the kind the page exists to expose.

Not a carbon cycle model. Deferred (see §9). Consequence: source and sink live on separate axes
and **never subtract**. Net flux without a thermostat is meaningless. There is no minus sign
anywhere on the page and no affordance to make one.

---

## 2. Vocabulary

The page says **"choices"** and **"sensitivity"** for anything reconstructed, and reserves
**"uncertainty"** for measured quantities with published error. Consistently — UI, README, code
comments.

This is not a style preference. An uncertainty is a distribution over an unknown true value.
What we have for reconstructions is a set of defensible alternatives, each of which is a real,
nameable thing somebody built. They are different objects and the page must not blur them.

---

## 3. Encoding

Directly downstream of §2, and the most important design rule here:

| Object | Encoding | Meaning |
|---|---|---|
| Driver curves | **Spaghetti** — discrete named strands | constructed; each strand is a real choice |
| Observations | **Shaded envelope** | measured; genuine error with a published source |

Every strand corresponds to a nameable combination (*Merdith2021 · ±15° · Ex_max · 10 Myr*).
Hover identifies it; click snaps the knobs to it. Nothing is drawn that does not correspond to a
choice somebody could defend. The spaghetti is not a summary of the choice space — it *is* the
choice space, enumerated.

A translucent hull was rejected: it reads as a 95% confidence interval to every scientist who
sees it, which would be the page committing its own sin in its own headline graphic.

Shaded envelopes are reserved for CO₂ proxy bounds and van der Meer's published error columns.

**Bound:** spaghetti becomes unreadable past ~50 strands. With categorical knobs and snapped band
widths the real count is in the dozens. If it overflows, subsample **visibly** and say so — never
silently.

---

## 4. The globe

Its job is to make an abstract parameter concrete. The tropical band is drawn as a shaded belt
whose width **is** the knob; features render in-band bright / out-of-band dim. Dragging ±15°→±25°
visibly captures or releases *named sutures* while the curve steps underneath. The reader sees
that "±15°" is not a number, it is a decision about whether the Tsangpo suture counts.

- Orthographic ⇄ Robinson (both already in `shared/js/globe.js`, with the vendored d3-geo clip
  fix for the antimeridian seam).
- Latitude histogram down the left edge — same primitive array, summed over the current slice.
  Aligns exactly with the y-axis in Robinson.
- 5 Myr steps, 0–800 Ma. (Was 0–1000; cut back because only Merdith2021 reaches the
  earliest Neoproterozoic at all and the suture record thins to nothing before ~800 Ma, so the
  extra 200 Myr was a mostly-empty axis squeezing everything else.)

Accepted asymmetry: plate-model choice and suture age-definition have no geographic gesture.
Switching models just makes things jump. Not worth contriving a globe role for every knob.

---

## 5. Layout

Two claims, two widgets, one screen.

```
┌──────────────────────────────┬────────────────────┐
│  ▌ globe (ortho ⇄ Robinson)  │  knobs             │
│  ▌ + latitude belt           │  (sourced / ours   │
│  ▌ lat histogram at left     │   marked)          │
├──────────────────────────────┴────────────────────┤
│  promoted driver — full spaghetti + observation   │  ← sensitivity
├───────────────────────────────────────────────────┤
│  sparklines: every other driver, bundle each      │  ← equifinality
├───────────────────────────────────────────────────┤
│  time slider (shared clock, as in the siblings)   │
└───────────────────────────────────────────────────┘
```

The sparkline strip *is* the equifinality display: six little bundles that all rise and fall
roughly with the ice record, and you cannot pick the winner. Click one to promote it. The
promoted chart is the sensitivity display. The click-to-promote gesture is what connects the two
claims — you notice in the strip that arc length and suture length look alike, promote each in
turn, and find both bundles wide enough to swallow the difference.

---

## 6. Drivers — original multi-driver plan, now split across future pages

**This section describes the original scope, before the "one driver, permanently" decision
at the top of this document.** Kept for its reasoning, not as a build list for this page: the
source/sink split below, and which quantity belongs on which side, is exactly the design
question the future LIP and continental-arc pages inherit. Nothing here gets built *on
tectonic-co2*.

Two groups that never subtract.

**Source side** — lengths → degassing, scalable by GEOCARB's published per-unit ranges:
ridge length, subduction length, continental arc length, rift length.

**Sink side** — weatherability: tropical suture length, tropical continental arc length,
tropical continental area.

Continental arc appears in **both**, deliberately. The same tectonic feature pushes CO₂ in both
directions and which effect dominates is exactly the quantification nobody can pin down. The page
should make that visible rather than tidy it away.

**Observations:** CO₂ proxies (consensus line ⇄ per-method clouds), Sr, glacial extent, zircon
frequency, van der Meer slab length.

### Composites

Permitted **within** a group only. Source-side terms sum into a total degassing flux — legitimate,
because with a per-km flux scaling they are genuinely the same quantity in the same units, and
GEOCARB's published input ranges give those scalings a cited provenance. Sink-side terms combine
into a weatherability index.

Free cross-group weighting was rejected: summing a degassing proxy and a weathering proxy with
user-chosen weights invents exactly the unjustified quantification the page exists to expose.

---

## 7. Data

Everything below is already on disk. No new acquisition is needed for v1.

### Primitives (one build script, one array)

Latitude-binned boundary length per type, per model, per time:
**1° latitude bins × 5 boundary types × 201 time steps × N models ≈ 3.6 MB float32.**

1° bins so the ±10/15/20/40 band edges land exactly on bin boundaries rather than being
interpolated. Every latitude knob (band width, weighting shape, smoothing) is then a browser-side
reduction over this array, computed in microseconds — which is what makes live strand enumeration
cheap.

`deep-time-map/python/boundaries.py` already writes `overriding_plate_id` per subduction segment
via `find_overriding_and_subducting_plates`. Continental-arc classification is one
plate-id-to-continent lookup away, not a new algorithm.

### Compilations (already in reconstructable frames)

| Source | Path | Notes |
|---|---|---|
| Macdonald sutures | `~/GIT/Tectonic/Arc_Continent_Analysis-master/data/sutures/` | 115 sutures; `Suture_Lines_attributes.csv` has `MAGMAX/MIN`, `METMAX/MIN`, `EXMAX/MIN` and **two** plate-ID columns (`PLATEID_M`, `PLATEID_CE`). `Suture_Lines_M2021.gpml` already in Merdith2021. |
| Macdonald output (verbatim) | `…/code_output/ice_LIP_suture_lengths.csv` | columns `within_10/15/20_suture`, `greater_10/15/20/40_suture`, `total_LIP_decay`, ice extent |
| Jackson & Macdonald rifts | `~/GIT/pygplates-rifts/JacksonMacdonald/jm_rifts_with_M2021_Ages.geojson` | already in Merdith2021 |
| van der Meer slab lengths | `~/GIT/pygplates-rifts/vanderMeer_SlabLengths.dat` | 20 points ~8–250 Ma, with `TomoError`, `SBZLengthError`, `PoorImagingError`, `ErrorRMS`, min/max ratios |
| Şengör & Natalin rift length | `~/GIT/pygplates-rifts/Sengor/SengorNatalin2001_RiftLengthBinned.csv` | |
| Cao 2017 arc length | `~/GIT/pygplates-rifts/Cao/Cao_ArcLength_10MyrBins.dat` | |
| Reference boundary lengths | `~/GIT/pygplates-rifts/RiftLengthFiles/PlateBoundaryLengths_230Ma_to_present.txt` | subduction/ridge/transform/rift, precomputed |

### Observations

| Source | Path | Contents |
|---|---|---|
| pySCION geochem | `~/GIT/pySCION/data/geochem_data_2020.mat` | CO₂ **by method** with high/low — paleosol (655), stomata (357), phytane (306), alkenone (278), boron (266), liverwort (15); Sr (541 pts, 0–540 Ma); δ¹³C, δ³⁴S, O₂, SO₄, T, paleolat |
| Foster/Royer/Lunt 2017 | `~/GIT/SODP/data/co2/foster_royer_lunt_2017_loess.json` | LOESS consensus line |
| Glacial extent | `…/Arc_Continent_Analysis-master/data/ice/IceExtent_Myr.csv` | per-region with latitude-from-pole — reconstructable, not just a bar |
| GEOCARB parameter ranges | `~/GIT/pygplates-rifts/CO2/GEOCARB_input_summaries.csv` | `distribution_type`, `mean`, `two_sigma`, limits, `source` per parameter — incl. `fR` (relief), `fA` (land area), `fD` (runoff), `fL` (carbonate area) |
| Zircon frequency | `~/GIT/StoryMaps/zircons/data/zircon_histogram.csv` | reuse |
| Scotese GAT | `~/GIT/pySCION/data/Scotese_GAT_2021.mat` | **default off** — partly constructed to be consistent with the CO₂ record, so plotting it as an independent target risks circularity |

**Both** the consensus line and the per-method clouds ship. Per-method is the better display — a
LOESS through six methods with different systematic biases is itself a strong contestable
modelling choice, and drawing it as one confident line while the page argues about unexamined
smoothing would be self-undermining. But people are used to seeing the consensus line, so it is
the familiar default with per-method one click away.

---

## 8. Models

**No tiers.** A capability matrix. Every model places things in latitude; only some have
topologies and therefore yield boundary lengths. Scotese is not a second-class model, it is a
model without closed plates.

The split is scientifically meaningful, not a technical apology: **paleolatitude is constrained by
paleomagnetic data; boundary length is a modelling construction.** Different kinds of claim with
different pedigrees, and the page says so by structure alone.

| | 0–200 Ma | Paleozoic | Neoproterozoic |
|---|---|---|---|
| with topologies | Merdith2021, Seton2012, Müller2016/2019, Matthews2016, Cao2024 | Merdith2021, Domeier&Torsvik2014, Matthews2016 | Merdith2021, Li2023 (E/W) |
| rotations only | Scotese, Torsvik&Cocks, Golonka, van Hinsbergen | Scotese, Torsvik&Cocks, Golonka | Li2008 |

Availability thins unevenly with age.

**v1 builds:** Merdith2021 (default), Torsvik&Cocks2017 as gprm distributes it, and
TC2017_SHM2017_D2018 — the source's own rotation file, which is what the published curve was
computed on (CEED + Swanson-Hysell & Macdonald + Domeier, anchor 1) and which this page
reproduces to an RMS of 70 km. The last two are the *same named model* from two files that put
Laurentia 13° apart at 445 Ma; both ship, because that disagreement is the page's own subject
stated as plainly as the data allows. See README, "Which frame the published curve is in".

The suture compilation carries a third plate-ID column (`PLATEID_M` → Matthews2016), so that
model is one build script away if the axis is ever worth widening — not built for v1.
Scotese remains wanted but needs plate IDs assigned by point-in-polygon (see Open questions).
Seton2012 if it comes cheap.

**Every model ships its own reconstruction.** Selecting a model swaps its continents, its
boundaries and its sutures together, because drawing one model's continents under another's
sutures puts collisions out to sea and makes the model control look like it does less than it
does. `build/models.py` holds the registry all three build scripts read. A model without
topologies (CEED) simply has no boundaries, which the page states rather than papering over
with another model's.

**Anchor plate travels with the model.** CEED is reconstructed on plate 1 (the spin axis, per
Macdonald's own notebook), Merdith2021 on 0 (where its 001/000 sequence is identity, so the two
are the same). Not a user control — there is no anchor menu item. It is a build-time setting
because the anchor also determines which plates are reconstructable: validity is tested by
building pygplates' reconstruction tree *on that anchor* at each timestep and asking whether the
plate has an edge, so past the anchor sequence's span the plates drop out rather than the frame
silently reverting to un-anchored. See README.

**Plate-ID columns, established by test, not by their names:** `PLATEID1` → Merdith2021,
`PLATEID_M` → **Matthews et al. 2016** ("M" is Mathews, not Merdith), `PLATEID_CE` → CEED /
Torsvik&Cocks. A first pass used `PLATEID_M` with Merdith2021 rotations on the name alone; the
tell was that a plate ID a model does not know returns the *identity* rotation rather than
erroring, so the suture silently sits at its present-day position. See README for the test.

Torsvik&Cocks matters disproportionately: Macdonald's `PLATEID_CE` column *is* the CEED frame, so
it slots straight into the most important knob on the page without needing topologies at all.

**Lineage is annotated on the model selector.** Seton2012 → Müller2016 → Müller2019 → Müller2022
is a revision series; Matthews2016 / Young2019 / Cao2024 are the same lab. A wide band drawn from
four EarthByte revisions must read as what it is. Turning the page's own standard on itself is the
most convincing thing it can do.

### Storage

`zircons/data/frames` is **90 MB for one model at 1 Myr**. Five models at that resolution is
~500 MB — not deployable.

**5 Myr uniform**, all models get frames, lazily loaded per model, gzipped via the existing
`gzipFetch`. ≈18 MB frames + ≈2 MB continents per model. Rotation-only models are far cheaper —
continents plus reconstructed sutures, 2–3 MB.

Three reasons beyond size. The globe's job here changes on tens of Myr, and nobody perceives 1 vs
5 Myr while scrubbing. 5 Myr is the resolution the *science* is at — Macdonald's suture output is
5 Myr, Cao's arcs are 10 Myr bins, GEOCARB is 10 Myr; shipping 1 Myr implies a precision the
inputs do not have, which on this page is the wrong implication. And it makes model switching a
real interaction rather than a chart-only abstraction — under a single-display-model design the
globe wouldn't move, quietly teaching that model choice is a minor detail.

Cost: slightly steppier playback than the siblings, and it breaks family consistency. Both worth
paying.

---

## 9. Knobs

| Knob | Type | Range source |
|---|---|---|
| Plate model | categorical | the models that exist and cover the time |
| Latitude band half-width | continuous, snapping | **±10/15/20/40 — Macdonald's own output** |
| Latitude weighting shape | categorical | step edge / cosine / runoff-weighted |
| Suture activity definition | categorical | `Ex_max`, `Ex_max_min`, magmatic, metamorphic — the columns in the source file |
| Continental-arc test | categorical + distance | overriding-plate continentality + buffer |
| Smoothing / binning window | continuous | **ours** |
| Per-km CO₂ flux (source side only) | continuous | GEOCARB published input ranges |

**Sourced vs ours is marked in the UI**, on every knob, regardless of whether that knob varies —
the taper in latitude weighting is "ours" and still draws its full enumerated set alongside the
sourced hard edge. What actually decides whether a knob varies is not sourced-vs-ours, it is
whether its values are commensurable with each other: see the next section.

A continuous knob is where the page could cheat. Sweeping band width 0–90° and calling the result
uncertainty would make the spread our artefact, not the literature's. Hence snapping to the four
values Macdonald himself computed — the knob can still slide freely for exploration, but strand
enumeration samples the sourced set.

**Latitude weighting shape is the most valuable knob and the least discussed in the literature.**
A hard ±15° edge is a fiction; weathering does not switch off at 15.1°. Offering cosine or
runoff weighting shows the sharp band was never a physical statement — and it is the one knob
where the globe makes the point instantly: the belt goes from a crisp stripe to a soft gradient
and the curve changes shape, not just amplitude.

### Which knobs vary — a fixed rule, not a toggle

Shipped: plate model, latitude band and weighting shape always draw their full enumerated set,
every strand at once. Activity definition always draws only the one currently selected, never
more. This was originally a per-knob checkbox ("vary across the bundle") so a reader could turn
any one contributor off and watch the bundle collapse or not — the idea being that this turns
"everything is uncertain" (weak, easily dismissed) into "your conclusion rests on one choice, and
it isn't the one that was defended" (specific, checkable). Live, the checkbox's label communicated
none of that to a first-time reader, so it was removed rather than relabelled: the rule that
matters — activity definition doesn't mix with the others, full stop, see the previous section and
that knob's own on-page note — is now just how the page behaves, not something a reader has to
discover a control for.

Still open, and worth checking once the family has more than one driver to compare: for tropical
suture length the *latitude band* may contribute less than expected — sutures cluster, so
±10→±20 captures whole belts rather than shaving edges — while the *age definition* (fixed, so not
directly visible in the bundle, but comparable by switching it and reading the chart's axis) may
contribute a lot, since it changes how long each suture stays active and that scales the integral
directly. If so, the finding is not "the result is wrong" but "the robustness argument was made
about the wrong parameter".

---

## 10. Attribution

**Cite what we actually used.**

- Recomputed from topologies → cite the **reconstruction** plus our own method. Not whoever later
  interpreted the quantity.
- Shipped verbatim from an author's supplement → attributed to that dataset as published
  (`ice_LIP_suture_lengths.csv` is literally Macdonald's output, so that one is exactly his).
- **Interpretive papers go in *Further reading* only**, with no curve on the page claimed to be
  theirs — Gernon et al. 2021, Macdonald et al. 2019's conclusions, Raymo & Ruddiman 1992,
  McKenzie et al. 2016, Brune et al. 2017. The viewer's numbers will not exactly reproduce those
  papers' numbers, so claiming them would be a misrepresentation with someone's name on it.

The page characterises nobody. It reports parameter values, which are matters of record. The
critique happens in the user's own hand when they drag a slider, and any objection to what they
see is an objection to arithmetic.

### The van der Meer comparison — handle carefully

At ~8 Ma van der Meer's tomographic slab-belt length is **42,426 ± 1,349 km**. Merdith2021's
topologies at 0 Ma give **62,786 km**. Two published estimates of "subduction zone length", ~50%
apart, at the time we know best — deep time cannot be blamed.

**These measure different things.** Van der Meer's SBZ is the belt of *imaged slab*, integrating
subduction over the preceding tens of Myr and missing poorly-imaged or fully-descended slabs;
Merdith's is instantaneous resolved trench length. Presenting them as directly comparable would be
sloppy in exactly the way the page objects to. Draw them as two threads with their definitions
stated, and present the gap as **definitional plus observational** — not one refuting the other.

---

## 11. Build order

**Walking skeleton on tropical suture length, end to end**, then broaden.

It is the only driver that exercises every mechanism: a published compilation with
author-enumerated alternatives, two plate frames already in its own attribute table, a latitude
knob with visible geographic meaning, and an observational target. If the knob → belt → spaghetti
loop does not feel right, this is the cheapest place to find out.

Mitigation for the obvious risk — a skeleton tuned to discrete reconstructable features may not
generalise to boundary-length drivers that come from the binned array: **the chart consumes a
reduced curve as its interface**, indifferent to whether that curve came from summing line
segments or reducing an array.

1. Scaffold from `zircons/` — Merdith2021 frames at 5 Myr, globe + Robinson, shared clock.
2. Latitude belt on the globe + latitude histogram.
3. Macdonald sutures reconstructed (Merdith2021 and CEED frames).
4. Band-width and age-definition knobs → reduced curve → spaghetti.
5. Glacial extent underneath. **Skeleton complete — evaluate here.**
6. Primitive array build (latitude-binned lengths, all types).
7. Remaining drivers; sparkline strip.
8. Observations: CO₂ (both views), Sr, zircon frequency, van der Meer.
9. Scotese + Torsvik&Cocks; lineage annotation.
10. Sourced/ours markers, Further reading, README.

---

## 12. Deferred

**In scope for this page** — more reconstructions for the same driver, not more drivers:

- **Clennett2020** in a paleomagnetic frame — needs conversion work; interesting as a comparison.
- Müller2019 (deforming), Cao2024, Li2023, Müller2022, Matthews2016, Domeier&Torsvik2014.
- Shorter-range variants of the page (0–200, 0–540).

**Belongs to a future page, not this one** — kept here so the reasoning behind each isn't lost,
each moves with whichever sibling page picks it up:

- **LIP weathering** — Park, Swanson-Hysell et al.; Franklin LIP → Sturtian Snowball link (Cox et
  al. 2016; Macdonald & Swanson-Hysell). The strongest story in the deep-time window, and part of
  why this page's own axis reaches 800 Ma even without drawing it. Needs a second primitive:
  reconstructed LIP area by latitude with an emplacement-decay function. Macdonald's
  `total_LIP_decay` / `within_15_LIP_decay` columns are a reference implementation.
  `gprm.datasets.Seafloor.LargeIgneousProvinces`. Belongs to the future LIP-driver page — see the
  scope note at the top of this document for why that page's relationship to `../lips` isn't
  decided yet.
- **van Hinsbergen / Atlas of the Underworld** — the modern descendant of van der Meer's
  tomographic slab approach. Belongs wherever subduction-driven degassing gets built.
- **Carbon cycle box model** (GEOCARB/COPSE in the browser). Physically the more honest object,
  but a working thermostat means CO₂ barely responds to degassing changes at steady state, so most
  knobs would produce a small dull response — and it argues against a claim the driver-comparison
  papers did not make. Belongs to the future synthesis page, if anywhere.
- **Carbonate-intersecting arcs.** Needs paleogeographic carbonate platform extent consistent
  across multiple plate models, which does not exist. Faking it would be the exact sin the page is
  about. Belongs to the future continental-arc page, and the same objection applies there.

---

## 13. Open questions

- Does Seton2012 make v1? Cheap, but only worth it if the build is genuinely trouble-free.
- Exact latitude weighting shapes beyond step and cosine — is there a sourced runoff weighting, or
  is that ours and therefore marked?
- **How do sutures get plate IDs in the Scotese frame?** The table covers Merdith2021
  (`PLATEID1`), Matthews2016 (`PLATEID_M`) and CEED (`PLATEID_CE`) but not Scotese. That is a
  build step — point-in-polygon against Scotese static polygons — not a lookup, and it would be
  the first plate ID this page assigns itself rather than takes from the source, so it needs
  marking as such in the UI's provenance scheme.
- ~~Does the strand count stay in the dozens once all knobs are live?~~ Answered: yes, 24
  (3 models × 4 bands × 2 weightings, definition fixed).

---

*Draft prepared with Claude Code.*
