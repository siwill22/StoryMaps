"""
Reconstruct Macdonald's ophiolite-bearing suture compilation through time.

Source
------
`Suture_Lines_M2021.geojson` from Macdonald, Swanson-Hysell, Park, Lisiecki & Jagoutz
(2019), *Science* 364, 181-184, via the authors' own `Arc_Continent_Analysis` repository.
115 sutures, present-day geometry, with the full attribute table attached to each feature.

What the attribute table gives us, and why it matters here
----------------------------------------------------------
Each suture carries THREE age intervals, each with a max and a min:

    MAGMAX/MAGMIN   magmatic
    METMAX/METMIN   metamorphic
    EXMAX/EXMIN     exhumation

and THREE plate-ID columns. **This page assigns no plate IDs of its own.** Every ID comes
from the source file; all we do is pick which column goes with which rotation model, and
which column that is was established by test, not by reading the names:

    PLATEID_CE   CEED, i.e. Torsvik & Cocks 2017
    PLATEID_M    Matthews et al. 2016 -- "M" is for Mathews, NOT Merdith. The authors'
                 own output directories are CEED_Ex_max, CEED_Ex_max_min,
                 Mathews_Ex_max, Mathews_Ex_max_min; the paper is from 2019 and so
                 predates Merdith2021; and the column carries deforming-mesh-style IDs
                 (28011, 18103, 61405, 2901, 60301) typical of that model generation.
    PLATEID1     Merdith2021. This is what Suture_Lines_M2021.geojson exists to add --
                 the standard GPlates reconstruction-plate-ID property, re-assigned for
                 that model. It differs from PLATEID_M on 20 of the 115 sutures.

The test that settled it, for each (column, model) pair: how many sutures have a plate
with no rotation chain at all, and what fraction of suture vertices land on reconstructed
continental crust (a suture is a collision zone welded into continents, so one floating in
open ocean means the ID is wrong for that model). Under Merdith2021, PLATEID1 leaves 1
plate absent of 115 and puts 76.2% of vertices on continent; PLATEID_M leaves 3 and
manages 71.8%; PLATEID_CE leaves 19. Under TorsvikCocks2017 the ordering reverses and
PLATEID_CE wins with 4 absent against 12 for PLATEID1. The continent-overlap margins are
narrow because these models share most of their plate-ID conventions -- the absent-plate
count is the decisive measure, and the two agree.

Getting this wrong is quiet rather than loud: a plate ID that a model does not know
returns the identity rotation (see below), so the suture simply sits at its present-day
position while everything around it moves.

Only PLATEID1 and PLATEID_CE are built. PLATEID_M is kept in the payload because it is the
evidence that "_M" is not Merdith, and because Matthews2016 is one registry entry away if the
model axis is ever worth widening.

The published curve itself is PLATEID_CE / CEED on anchor 1 -- every column in the source's
output CSV comes from a `_TC17_SHM17_D18` variable. The notebook's Matthews pass is unpublished
and miswired (it feeds CEED-plate-ID features to the Matthews rotations); see README, "Which
frame the published curve is in".

This page does NOT pick one. It ships the attributes and lets the browser apply the
definition, so the activity rule is a knob rather than a decision baked into the export.
That is the entire point of the page, so it would be perverse to bake it in here.

What "active" means, precisely
------------------------------
In the source repository the activity rule is encoded as the gpml feature's valid time,
and `pygplates.reconstruct(..., t)` then silently returns only the features valid at t.
The two variants are:

    Ex_max       valid [EXMAX, 0]       -- active from exhumation onset to the present
    Ex_max_min   valid [EXMAX, EXMIN]   -- active only through the exhumation interval

`Suture_Lines_M2021.geojson` is the Ex_max_min encoding (its FROMAGE/TOAGE are EXMAX and
EXMIN). We ignore FROMAGE/TOAGE and re-derive every window from the raw columns instead,
so all four definitions -- plus the magmatic and metamorphic intervals, which the authors
tabulated but did not use for the published curve -- are available to the reader.

Geometry is therefore exported across the UNION of every window a knob could select:
[max(MAGMAX, METMAX, EXMAX), 0]. Reconstructing outside that is wasted bytes; inside it,
every definition has the geometry it needs.

Why reconstructed geometry per timestep, rather than geometry-plus-rotations
---------------------------------------------------------------------------
`continents.json` ships present-day geometry with a rotation series and rotates in the
browser, because 32,000 vertices x 201 frames is not an option. Sutures are three orders
of magnitude smaller -- ~2,600 tessellated vertices in total -- so shipping them already
reconstructed costs ~1.5 MB and saves the page from carrying a second rotation engine
alongside the one PolygonLayer already has. The browser gets lon/lat it can bin directly.

Tessellation
------------
Present-day geometry is coarse (Quetta is 9 vertices for 1,279 km). Latitude binning needs
finer sampling than that or a single long segment lands wholly in one 1-degree bin, so
every polyline is tessellated to TESSELLATE_DEG before reconstruction. This is the same
reason the boundary export tessellates, and the same value.

A note on plate-ID validity -- the failure this script exists to prevent
------------------------------------------------------------------------
Asking for a rotation outside a plate's defined time range does not raise. pygplates
returns the IDENTITY rotation, so the feature is drawn at its present-day position as if
no reconstruction had happened. On a scrubbing globe that reads as a suture teleporting
home and sitting still, which is easy to miss and impossible to interpret.

(../detrital-zircons documents this as "holds the oldest pole fixed". Measured here
against Merdith2021's own rotation file, what actually happens outside the range is
identity, not a hold. Same silence, worse result.)

It happens even with the right column, because a plate's rotation sequence often does not
reach as far back as a suture's own activity interval -- e.g. under Merdith2021 plate 420
has no usable chain, so Verkhoyansk (430-0 Ma) is dropped, and Bangong is clamped 471-0 to
432-0 Ma.

The two models lose DIFFERENT sutures and clamp at different depths. That is a coverage
difference, not a geological one, and it lands squarely on the deep-time end of the curve,
so the page reports it rather than letting a reader read the gap between two curves as a
result.

THE ANCHOR PLATE IS PART OF THIS. Reconstructing relative to a non-zero anchor inserts the
anchor's own chain into the circuit, so a plate is only usable where BOTH are defined --
and outside the anchor's span its rotation also quietly becomes the identity, which would
slide the reconstruction back into the un-anchored frame partway through the record without
raising anything. For TorsvikCocks2017, anchored on 001 (the spin axis -- see
build/models.py), whose 001-relative-to-000 sequence runs 0-600 Ma, that caps every plate
at 600 Ma.

So this script asks pygplates, per timestep, whether each suture's plate has an edge in the
reconstruction tree built at that time on that anchor -- see `reconstructable_times()`,
which also records the crossover bug an earlier hand-rolled version of this test had.
Sutures left with nothing are dropped from that model and listed by name. Both the clamps
and the drops are counted into the payload's `meta.coverage` so the page can say what it
lost rather than quietly showing less than it claims.

Note that this makes the page STRICTER than the source analysis, deliberately. Macdonald's
notebook calls `pygplates.reconstruct` and takes what comes back, and what comes back for a
plate with no chain is the identity -- the suture sitting at its present-day coordinates,
counted into whatever latitude band it happens to occupy today. This page drops it instead.
That is the whole reason the two curves part company in the Early Palaeozoic.

Run:  conda run -n pygmt17 python build/build_sutures.py
"""

import json
import math
import os
import sys

import pygplates

from gprm.datasets import Reconstructions

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SOURCE = os.path.expanduser(
    "~/GIT/Tectonic/Arc_Continent_Analysis-master/data/sutures/Suture_Lines_M2021.geojson")

sys.path.insert(0, os.path.join(HERE, "build"))
from models import MODELS, START_TIME, END_TIME, TIME_STEP, load, model_dir  # noqa: E402

# {model: plate-ID column}. The pairing is established by test, not by the column names --
# see the module docstring.
PLATE_ID_COLUMNS = {name: spec["plate_id_column"] for name, spec in MODELS.items()}

# Same tessellation as the boundary export. ~55 km at the equator, so a 1-degree latitude
# bin is never crossed by a single unsampled segment.
TESSELLATE_DEG = 0.5

DECIMALS = 3

EARTH_RADIUS_KM = pygplates.Earth.mean_radius_in_kms

CITATION = (
    "Macdonald, F.A., Swanson-Hysell, N.L., Park, Y., Lisiecki, L. & Jagoutz, O. (2019), "
    "Arc-continent collisions in the tropics set Earth's climate state, Science 364, "
    "181-184. Geometry and attributes as published in the authors' Arc_Continent_Analysis "
    "repository."
)

NOTE = (
    "Activity intervals are shipped as raw attributes, not applied. The magmatic, "
    "metamorphic and exhumation intervals are all tabulated by the source; which one "
    "defines an 'active' suture is a choice the reader makes on the page."
)


def load_sutures():
    """Attributes and present-day geometry, one record per suture."""
    with open(SOURCE) as fh:
        fc = json.load(fh)

    out = []
    for feat in fc["features"]:
        p = feat["properties"]
        geom = feat["geometry"]
        if geom["type"] != "LineString":
            raise SystemExit("unexpected geometry {!r} on suture {}".format(
                geom["type"], p.get("ID")))

        out.append({
            "id": int(p["ID"]),
            "name": p["NAME"],
            "ref": p["REF"],
            # The three intervals, verbatim. Ma, max is the older end.
            "magmax": int(p["MAGMAX"]), "magmin": int(p["MAGMIN"]),
            "metmax": int(p["METMAX"]), "metmin": int(p["METMIN"]),
            "exmax": int(p["EXMAX"]), "exmin": int(p["EXMIN"]),
            "length_km": int(p["LENGTH_KM"]),
            "plate_ids": {m: int(p[c]) for m, c in PLATE_ID_COLUMNS.items()},
            # GeoJSON is lon,lat; pygplates wants lat,lon.
            "_latlon": [(c[1], c[0]) for c in geom["coordinates"]],
        })
    return out


def tessellated(latlon):
    """Present-day polyline, densified so latitude binning has something to bin."""
    line = pygplates.PolylineOnSphere(latlon)
    return line.to_tessellated(math.radians(TESSELLATE_DEG))


def window(suture):
    """Union of every activity interval a knob could select: [oldest onset, 0].

    Ex_max runs to the present, so the young end is always 0 regardless of the MIN
    columns; the old end is whichever of the three MAX values reaches furthest back.
    """
    return max(suture["magmax"], suture["metmax"], suture["exmax"]), 0


def flanking_blocks(model, geoms, sutures, offset_km=120.0):
    """The named blocks on either side of each suture, measured from the model itself.

    The source attribute table names the SUTURE (Tsangpo, Quetta) and cites a reference,
    but it does not record which blocks collided -- so that cannot be read off it, and it
    is not something to supply from memory. It can, however, be measured: a suture is the
    join between two blocks, so sampling a little way off each side of the line and asking
    the model's own continent polygons what is there answers the question in the model's
    own vocabulary rather than in ours.

    Sampling is perpendicular to each segment, `offset_km` either side, on the sphere: for
    a segment midpoint m (unit vector) and unit tangent t, the perpendicular is m x t, and
    the offset point is the unit vector m*cos(a) +- (m x t)*sin(a) for a = offset/R. Both
    sides are collected together rather than labelled "upper/lower" -- vertex order in the
    source file is arbitrary, so which side is which carries no meaning and presenting it
    as if it did would be inventing information.

    Returns {suture_index: [(block_name, share_of_samples), ...]}, ranked, at present day.
    Present day is enough because these models move blocks as rigid polygons rather than
    merging or splitting them, so the polygons flanking a suture are the same set at every
    time; only their positions change.
    """
    polygons = model.continent_polygons or model.coastlines
    if not polygons:
        return {}

    # No anchor argument: PlatePartitioner's constructor does not take one. It does not
    # need to here -- this runs at present day, where every model's anchor rotation is the
    # identity, so anchor 0 and anchor 1 partition to the same polygons. Were this ever
    # moved off 0 Ma it would have to reconstruct the points into the anchored frame first.
    partitioner = pygplates.PlatePartitioner(polygons, model.rotation_model, 0.0)
    angle = offset_km / EARTH_RADIUS_KM

    out = {}
    for si, geom in enumerate(geoms):
        counts = {}
        total = 0
        points = geom.to_lat_lon_list()
        for k in range(len(points) - 1):
            a = pygplates.PointOnSphere(points[k]).to_xyz()
            b = pygplates.PointOnSphere(points[k + 1]).to_xyz()
            mid = [(a[i] + b[i]) / 2 for i in range(3)]
            nm = math.sqrt(sum(c * c for c in mid))
            if nm == 0:
                continue
            mid = [c / nm for c in mid]
            tan = [b[i] - a[i] for i in range(3)]
            nt = math.sqrt(sum(c * c for c in tan))
            if nt == 0:
                continue
            tan = [c / nt for c in tan]
            perp = [mid[1] * tan[2] - mid[2] * tan[1],
                    mid[2] * tan[0] - mid[0] * tan[2],
                    mid[0] * tan[1] - mid[1] * tan[0]]
            np_ = math.sqrt(sum(c * c for c in perp))
            if np_ == 0:
                continue
            perp = [c / np_ for c in perp]

            for sign in (1, -1):
                v = [mid[i] * math.cos(angle) + sign * perp[i] * math.sin(angle)
                     for i in range(3)]
                pt = pygplates.PointOnSphere(v)
                total += 1
                found = partitioner.partition_point(pt)
                if found is None:
                    continue
                name = found.get_feature().get_name()
                if name:
                    counts[name] = counts.get(name, 0) + 1

        if total:
            ranked = sorted(counts.items(), key=lambda kv: -kv[1])
            out[si] = [[n, round(c / total, 3)] for n, c in ranked[:4] if c / total >= 0.05]
    return out


def reconstructable_times(rotations, plate_id, times, anchor_plate, _cache={}):
    """The subset of `times` at which `plate_id` genuinely has a rotation chain.

    Ask pygplates rather than deriving it from the rotation file ourselves. Building the
    reconstruction tree at a time resolves the whole fixed-plate circuit for that time,
    anchor included; a plate with no path to the root has no edge in the tree. That is the
    same resolution `get_rotation` uses, so this test agrees with the reconstruction by
    construction instead of approximating it.

    An earlier version of this script walked the chain by hand from the rotation file's
    time samples, and got it wrong, in a way worth recording because it is easy to repeat:
    a plate's poles are frequently split across SEVERAL sequences with DIFFERENT fixed
    plates over different intervals -- a crossover. CEED's plate 302 is fixed to 301 over
    0-430 Ma and to 001 over 430-1110 Ma. Collapsing that to one (range, fixed plate) pair
    and walking a single parent declares Baltica unreconstructable at 440 Ma, when in fact
    it hangs directly off the anchor there. Eight sutures were being discarded at 440 Ma,
    the Scandinavian and Scottish Caledonides among them.

    Validity is also not necessarily one contiguous interval, which is why this returns a
    set of times rather than a (min, max) range.
    """
    key = (id(rotations), anchor_plate)
    trees = _cache.setdefault(key, {})
    usable = set()
    for t in times:
        tree = trees.get(t)
        if tree is None:
            tree = rotations.get_reconstruction_tree(float(t), anchor_plate_id=anchor_plate)
            trees[t] = tree
        # The anchor is the tree's root and so has no edge of its own; it is trivially
        # reconstructable relative to itself.
        if plate_id == anchor_plate or tree.get_edge(plate_id) is not None:
            usable.add(t)
    return usable


def build_for_model(sutures, model_name, plate_col, times, anchor_plate):
    model = load(model_name)
    rotations = model.rotation_model

    # One pygplates geometry per suture, built once and re-rotated at every timestep.
    geoms = [tessellated(s["_latlon"]) for s in sutures]

    blocks = flanking_blocks(model, geoms, sutures)

    # Restrict each suture's window to the times its plate is actually reconstructable.
    windows = []
    dropped = []
    clamped = []
    for s in sutures:
        old, young = window(s)
        wanted = [t for t in times if young <= t <= old]
        usable = reconstructable_times(
            rotations, s["plate_ids"][model_name], wanted, anchor_plate)
        if not usable:
            windows.append(None)
            dropped.append("{} (id {}, plate {}, active {}-0 Ma) -- plate has no "
                           "rotation chain anywhere in that interval".format(
                               s["name"], s["id"], s["plate_ids"][model_name], old))
            continue
        if len(usable) != len(wanted):
            clamped.append("{} (id {}): {}-0 -> {:.0f}-{:.0f} Ma".format(
                s["name"], s["id"], old, max(usable), min(usable)))
        windows.append(usable)

    frames = []
    for t in times:
        entries = []
        for i, s in enumerate(sutures):
            usable = windows[i]
            if usable is None or t not in usable:
                continue

            finite = rotations.get_rotation(
                float(t), s["plate_ids"][model_name], anchor_plate_id=anchor_plate)
            xy = []
            for lat, lon in (finite * geoms[i]).to_lat_lon_list():
                xy.append(round(lon, DECIMALS))
                xy.append(round(lat, DECIMALS))
            entries.append([i, xy])

        frames.append({"t": t, "geom": entries})

    coverage = {
        "blocks_named": sum(1 for v in blocks.values() if v),
        "sutures_total": len(sutures),
        "sutures_dropped": len(dropped),
        "sutures_clamped": len(clamped),
        "dropped": dropped,
        "clamped": clamped,
        # Present-day length actually reconstructable under this model, against the
        # 142,371 km the compilation describes.
        "length_km_available": sum(
            s["length_km"] for s, w in zip(sutures, windows) if w is not None),
        "length_km_total": sum(s["length_km"] for s in sutures),
    }
    return frames, coverage, blocks


def main():
    sutures = load_sutures()
    times = list(range(START_TIME, END_TIME + 1, TIME_STEP))
    out_dir = os.path.join(HERE, "data")
    os.makedirs(out_dir, exist_ok=True)

    print("{} sutures, {} km total present-day length".format(
        len(sutures), sum(s["length_km"] for s in sutures)))

    for model_name, plate_col in PLATE_ID_COLUMNS.items():
        anchor_plate = MODELS[model_name]["anchor_plate"]
        frames, coverage, blocks = build_for_model(
            sutures, model_name, plate_col, times, anchor_plate)

        print("  {} (anchor plate {}):".format(model_name, anchor_plate))
        if coverage["dropped"]:
            print("    {} suture(s) dropped -- no reconstructable window:".format(
                len(coverage["dropped"])))
            for d in coverage["dropped"]:
                print("      " + d)
        if coverage["clamped"]:
            print("    {} suture(s) clamped to their plate's defined range:".format(
                len(coverage["clamped"])))
            for c in coverage["clamped"]:
                print("      " + c)
        print("    flanking blocks named for {} of {} sutures".format(
            coverage["blocks_named"], coverage["sutures_total"]))
        print("    {:,} of {:,} km reconstructable ({:.0f}%)".format(
            coverage["length_km_available"], coverage["length_km_total"],
            100 * coverage["length_km_available"] / coverage["length_km_total"]))

        payload = {
            "meta": {
                "model": model_name,
                "plate_id_column": plate_col,
                # Which plate the reconstruction is held fixed to. Absent from earlier
                # builds, which is how an incorrect anchor went unnoticed -- see
                # build/models.py for why each model's value is what it is.
                "anchor_plate_id": anchor_plate,
                "times": times,
                "tessellate_degrees": TESSELLATE_DEG,
                "pygplates_version": str(pygplates.Version.get_imported_version()),
                "source": CITATION,
                "note": NOTE,
                "coverage": coverage,
            },
            # Attributes without the working geometry field, plus the blocks this model
            # puts either side of each suture (measured, see flanking_blocks()).
            "sutures": [dict({k: v for k, v in s.items() if not k.startswith("_")},
                             blocks=blocks.get(i, []))
                        for i, s in enumerate(sutures)],
            "frames": frames,
        }

        mdir = model_dir(out_dir, model_name)
        os.makedirs(mdir, exist_ok=True)
        path = os.path.join(mdir, "sutures.json")
        with open(path, "w") as fh:
            json.dump(payload, fh, separators=(",", ":"))

        drawn = sum(len(f["geom"]) for f in frames)
        verts = sum(len(xy) // 2 for f in frames for _, xy in f["geom"])
        print("  {}: {} suture-frames, {} vertices, {:.1f} MB -> {}/sutures.json".format(
            model_name, drawn, verts, os.path.getsize(path) / 1e6, model_name))


if __name__ == "__main__":
    main()
