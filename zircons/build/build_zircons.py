"""
Build this page's igneous zircon layer.

Source: Puetz et al. (2026), Geoscience Frontiers, doi:10.1016/j.gsf.2026.102416, via
gprm.datasets.Zircons.get_mafic_felsic_samples() -- the mafic/felsic igneous zircon
sample compilation, two spreadsheet sheets with slightly different column names (the
Mafic sheet calls its sample id column 'Sample_ID from publication' rather than
'Sample_ID'; normalised below so both share one FIELDS list, the same pattern
../plate-boundaries/build/build_points.py uses for the seven differently-shaped
BaseMetalDeposits sheets).

Filtered to age <= END_TIME. Unlike a 'window'-lifespan layer (deposits, where a point
outside the window is simply invisible at zero extra draw cost), this page shows a
zircon from its formation age all the way to the present (see js/story.js's
`lifespan: 'since'`) -- so a sample older than the page's own time span would sit there
permanently drawn and permanently faint, for no payoff. Recorded in the payload so the
page can say how much of the compilation that excludes.

Writes only the rotations transport (see deep_time_map.points for why there are two):
with points in the tens of thousands sitting on a few hundred plates, effective_points is
already far past the crossover where rotations wins, so there is nothing to learn from
also building the trajectory file here the way plate-boundaries does for its comparison.

Run:  conda run -n pygmt17 python build/build_zircons.py
"""

import datetime
import os
import sys
import warnings

import pandas as pd

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(HERE)

sys.path.insert(0, os.path.join(REPO, "shared", "vendor", "deep-time-map", "python"))

from deep_time_map import export_points, load_model  # noqa: E402

MODEL_NAME = "Merdith2021"
START_TIME = 0
END_TIME = 1000
TIME_STEP = 1

AGE_FIELD = "Magm. / crystal age (Ma)"

ROCK_TYPES = {
    "Felsic": {"label": "Felsic igneous zircon"},
    "Mafic":  {"label": "Mafic igneous zircon"},
}

# (payload key, spreadsheet column). 'Sample_ID' is the Mafic sheet's odd one out --
# normalised to the Felsic sheet's name before this list is applied.
FIELDS = [
    ("sample_id", "Sample_ID"),
    ("reference", "Reference"),
    ("country", "Country/Small Region"),
    ("continent", "Continent"),
    ("locality", "Locality"),
    ("age_type", "Type of age"),
    ("age_uncertainty", "2σ error  (myr)"),
    ("rock_type", "Class-3 Rock Type"),
]


def _undate(value):
    """A handful of Sample_ID values (e.g. '3-1') were auto-mangled into Excel dates by
    the spreadsheet itself, upstream of gprm -- '1966-03-01' rather than the original
    text, which is already lost. json.dump cannot serialise a bare datetime, so stringify
    it rather than let the whole export crash on 4 rows out of 24,519.
    """
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    return value


def load_zircons():
    """Both sheets concatenated, with a `type` column ('Felsic' / 'Mafic') added."""
    from gprm.datasets import Zircons

    frames = []
    for rock_type in ROCK_TYPES:
        gdf = Zircons.get_mafic_felsic_samples(rock_type=rock_type)
        gdf = gdf.drop(columns="geometry")
        gdf = gdf.rename(columns={"Sample_ID from publication": "Sample_ID"})
        gdf["type"] = rock_type
        frames.append(gdf)
        print("  {:<8s} {:6d} samples".format(rock_type, len(gdf)))

    gdf = pd.concat(frames, ignore_index=True, sort=False)
    for _, column in FIELDS:
        if column in gdf.columns and gdf[column].dtype == object:
            gdf[column] = gdf[column].map(_undate)
    return gdf


def main():
    warnings.filterwarnings("ignore")

    print("loading igneous zircon samples")
    gdf = load_zircons()
    total = len(gdf)
    print("  {} total".format(total))

    # points_from_dataframe's age_field defaults to 'Age' -- rename rather than pass a
    # kwarg, since export_points (unlike points_from_dataframe) does not expose one.
    gdf = gdf.rename(columns={AGE_FIELD: "Age"})

    gdf = gdf.dropna(subset=["Age"])
    gdf = gdf[gdf["Age"] <= END_TIME]
    print("  {} of {} have Age <= {} Ma ({} excluded, see module docstring)".format(
        len(gdf), total, END_TIME, total - len(gdf)))

    fields = [("type", "type")] + [f for f in FIELDS if f[1] in gdf.columns]

    model = load_model(MODEL_NAME)
    export_points(
        gdf,
        model_name=MODEL_NAME,
        start=START_TIME, end=END_TIME, step=TIME_STEP,
        transport="rotations",
        fields=fields,
        categories=ROCK_TYPES,
        meta={"source": "Puetz et al. (2026)",
              "doi": "10.1016/j.gsf.2026.102416",
              "caption": (
                  "Igneous zircon samples, mafic and felsic, Puetz et al. (2026). "
                  "{} of {} samples in the compilation have a magmatic/crystallisation "
                  "age of {} Ma or younger and appear on this page.".format(
                      len(gdf), total, END_TIME))},
        out_dir=os.path.join(HERE, "data"),
        model=model,
    )


if __name__ == "__main__":
    main()
