"""
Copy the published reference series this page draws underneath its own curves.

Everything here is an author's OWN output, shipped verbatim. Nothing in this file is
recomputed, re-binned or re-smoothed -- that is the whole point of it. Where the page
recomputes a quantity it says so and cites the reconstruction; where it shows somebody
else's published numbers, those numbers arrive here untouched and are attributed to that
dataset as published.

Source
------
`code_output/ice_LIP_suture_lengths.csv` from the Arc_Continent_Analysis repository
accompanying Macdonald, Swanson-Hysell, Park, Lisiecki & Jagoutz (2019), Science 364,
181-184. 105 rows, 0-520 Ma at 5 Myr steps -- the same step this page's globe runs at, so
no resampling is needed or done.

What gets copied, and why these columns
---------------------------------------
    ice_extent               glacial extent, degrees of latitude from the pole. Larger =
                             ice reached further toward the equator = colder. This is the
                             target record the suture argument is made against.

    total_suture             active suture length, km, no latitude filter
    within_10/15/20_suture   active suture length within +-10/15/20 degrees of the equator
    greater_10/15/20/40_...  the complement of each

    continental_arc_Cao2017  continental arc length from Cao et al. (2017), as used by
                             the same paper

The seven latitude-band columns are the reason this file matters more than any other on
the page. Macdonald computed the tropical-suture curve under FOUR plate-model/age-
definition combinations and SEVEN latitude bands, and published one of them. The
alternatives are not our invention and not a hostile reconstruction of somebody's method
-- they are sitting in the author's own supplementary output, and the page simply draws
them.

That is also why the band-width knob snaps to 10/15/20/40 rather than sliding freely: a
free 0-90 slider would make the spread OUR artefact. Snapped, every strand corresponds to
a number the source author actually computed.

Run:  python3 build/build_reference_series.py     (standard library only)
"""

import csv
import json
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SOURCE = os.path.expanduser(
    "~/GIT/Tectonic/Arc_Continent_Analysis-master/code_output/ice_LIP_suture_lengths.csv")

COLUMNS = [
    "age_Ma",
    "ice_extent",
    "total_suture",
    "within_10_suture", "within_15_suture", "within_20_suture",
    "greater_10_suture", "greater_15_suture", "greater_20_suture", "greater_40_suture",
    "continental_arc_Cao2017",
]

CITATION = (
    "Macdonald, F.A., Swanson-Hysell, N.L., Park, Y., Lisiecki, L. & Jagoutz, O. (2019), "
    "Arc-continent collisions in the tropics set Earth's climate state, Science 364, "
    "181-184; series as published in the authors' Arc_Continent_Analysis repository "
    "(code_output/ice_LIP_suture_lengths.csv). Continental arc length from Cao, W., "
    "Zahirovic, S., Flament, N., Williams, S., Golonka, J. & Muller, R.D. (2017), "
    "Improving global paleogeography since the late Paleozoic using paleobiology, "
    "Biogeosciences 14, 5425-5439."
)


def main():
    with open(SOURCE, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))

    missing = [c for c in COLUMNS if c not in rows[0]]
    if missing:
        raise SystemExit("source is missing expected columns: {}".format(missing))

    out_rows = []
    for r in rows:
        out_rows.append({c: float(r[c]) for c in COLUMNS})
    out_rows.sort(key=lambda r: r["age_Ma"])

    payload = {
        "meta": {
            "source": CITATION,
            "note": ("Published values, copied verbatim. Not recomputed, re-binned or "
                     "smoothed by this page."),
            "columns": COLUMNS,
            "time_step": 5,
        },
        "rows": out_rows,
    }

    os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
    path = os.path.join(HERE, "data", "macdonald2019.json")
    with open(path, "w") as fh:
        json.dump(payload, fh, separators=(",", ":"))

    ages = [r["age_Ma"] for r in out_rows]
    print("{} rows, {:.0f}-{:.0f} Ma -> {} ({:.0f} kB)".format(
        len(out_rows), min(ages), max(ages),
        os.path.basename(path), os.path.getsize(path) / 1e3))


if __name__ == "__main__":
    main()
