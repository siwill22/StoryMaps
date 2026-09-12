"""
Build this page's detrital zircon layer: one pie-chart glyph per SAMPLE, not per grain.

Source: Puetz et al. (2026), Geoscience Frontiers, doi:10.1016/j.gsf.2026.102416, via
gprm.datasets.Zircons.get_sedimentary_samples(version=2026) -- ~987k individual U-Pb
grain ages across 19,564 samples, one row per grain joined to its sample's site details
(so Longitude/Latitude/depositional age repeat once per grain). This script collapses
that to one row per sample (keyed on 'Ref-Sample Key', the only column confirmed unique
and internally consistent -- 'Sample_ID' alone collides across references, and a few
values are corrupted into Excel dates the same way build_zircons.py had to work around):
a fixed site, a depositional age (the host rock's age -- js/story.js only draws a sample
within `ageWindow` Myr of it, PointLayer's 'window' lifespan, since the page shows WHEN a
rock was deposited, not that it still exists today), and a histogram of its grains' LAG
TIMES (grain age minus depositional age -- how long between a zircon crystallising and
ending up in this sediment). js/pieLayer.js reads that histogram as the sample's own
empirical CDF of lag time and paints it as a continuous conic-gradient sweep, not flat
wedges -- see that module's own docstring.

Filtered to depositional age <= END_TIME, matching Merdith2021's own topology limit (same
reasoning as build_zircons.py): a sample whose host rock is older than the model can
reconstruct would have nowhere valid to sit. 16,477 of 19,564 samples (84%) survive this.

The lag-time histogram itself is NOT filtered to END_TIME -- a grain's lag time can be
(and often is) in the thousands of Myr, that is the whole point of a provenance record,
so bins run to 4400 Myr to cover the largest lag in the compilation. A grain dated
slightly YOUNGER than its own host rock's estimated depositional age (analytical
uncertainty rather than a real negative lag) is clipped to a lag of 0, not dropped or
left negative. Bin colour is assigned by the page's own js/pieLayer.js, not baked in
here, the same separation of "data" from "page design" build_zircons.py uses for its
rock-type colours.

Each sample also gets tectonic-setting statistics, computed by CALLING gprm's own
functions directly (not reimplemented here, so results stay byte-for-bit consistent with
"the Zircons.py", including whatever quirks are already in it):

  cawood_class  'A'/'B'/'C' from Zircons.tectonic_category() -- Cawood et al. (2012),
                thresholding the same lag-time CDF this page's pies already visualise.
                A fixed classification, no free parameter.
  barham_ratio  percentile/chi_square from Zircons.tectonic_fingerprint() -- Barham et
                al. (2022, EPSL). That function itself only returns two continuous
                statistics (chi_square, percentile); this page ships their RATIO rather
                than a precomputed class so js/story.js can threshold it live with a
                slider (20 -- the split used in the user's own comparison notebook,
                ~/GIT/zircons/zircon_class_comparison.ipynb -- is only the slider's
                starting position, not baked in here).

Run:  conda run -n pygmt17 python build/build_detrital_zircons.py
"""

import contextlib
import datetime
import io
import os
import sys
import warnings

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(HERE)

sys.path.insert(0, os.path.join(REPO, "shared", "vendor", "deep-time-map", "python"))

from deep_time_map import export_points, load_model  # noqa: E402

MODEL_NAME = "Merdith2021"
START_TIME = 0
END_TIME = 1000
TIME_STEP = 1

SAMPLE_KEY = "Ref-Sample Key"
GRAIN_AGE_FIELD = "U-Pb Non-Iter. Prob. age (Ma)"
DEPOS_AGE_FIELD = "Strat/Dep  Age (Ma)"     # two spaces -- matches gprm's own column name

# Histogram bins, in Myr OF LAG TIME (grain age - depositional age), not absolute age.
# js/pieLayer.js turns this into gradient colour stops rather than flat wedges -- the bin
# width sets how many control points that gradient has to work with, i.e. how closely it
# can follow the sample's own empirical CDF, not whether the result looks stepped (the
# gradient interpolates smoothly regardless). 20 was chosen over the original 100 once
# the pies became gradients, purely to sharpen that CDF approximation; 4400 covers the
# largest lag time in the compilation with one bin to spare (220 bins at this width).
BIN_WIDTH = 20
MAX_BIN_EDGE = 4400

# (payload key, samples-dataframe column). 'reference' and 'n_grains'/'dominant_lag'/
# 'spectrum' are computed in build_samples() below; 'cawood_class'/'barham_ratio' come
# from compute_tectonic_classes() and are merged on afterwards -- neither is sourced
# from gprm directly under these names.
FIELDS = [
    ("sample_id", "Sample_ID"),
    ("reference", "reference"),
    ("country", "Country/Small Region"),
    ("continent", "Continent"),
    ("locality", "Locality"),
    ("rock_type", "Class-3 Rock Type"),
    ("n_grains", "n_grains"),
    ("dominant_lag", "dominant_lag"),
    ("cawood_class", "cawood_class"),
    ("barham_ratio", "barham_ratio"),
    ("spectrum", "spectrum"),
]


def _undate(value):
    """See build_zircons.py's own _undate: a handful of sample codes (e.g. '3-1') were
    auto-mangled into Excel dates upstream of gprm, and json.dump cannot serialise a bare
    datetime.
    """
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    return value


def _clean(value):
    """None rather than NaN/pandas.NA -- both mean 'not recorded', and json.dump chokes
    on pandas.NA specifically (it is not a float, so the usual isnan check misses it).
    """
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return _undate(value)


def load_grains():
    from gprm.datasets import Zircons

    gdf = Zircons.get_sedimentary_samples(version=2026)
    gdf = gdf.drop(columns="geometry")
    gdf["Sample_ID"] = gdf["Sample_ID"].map(_undate)
    return gdf


def build_samples(gdf):
    """One row per sample: site metadata + a sparse lag-time histogram.

    Sparse rather than one column per bin: a ~50-grain sample typically populates a
    handful of a possible 44 bins, and 19,564 samples x 44 ints would more than double
    points.json for bins the gradient would never get a colour stop from anyway (an
    empty bin contributes nothing to the sample's own CDF).
    """
    n_bins = MAX_BIN_EDGE // BIN_WIDTH
    edges = np.array([i * BIN_WIDTH for i in range(n_bins + 1)], dtype=float)

    rows = []
    for key, group in gdf.groupby(SAMPLE_KEY, sort=False):
        depos_age = group[DEPOS_AGE_FIELD].iloc[0]
        ages = group[GRAIN_AGE_FIELD].dropna().to_numpy()
        if len(ages) == 0 or pd.isna(depos_age):
            continue

        # Lag time: how much older a grain is than the rock it ended up in. A grain
        # dated slightly YOUNGER than the sample's own depositional age is analytical
        # uncertainty around lag~0, not a real negative lag, so clip at 0 rather than
        # drop it -- a real grain the sample actually has, just not usefully placed in a
        # bin below zero.
        lags = ages - depos_age
        clipped = np.clip(lags, edges[0], edges[-1] - 1e-6)
        counts, _ = np.histogram(clipped, bins=edges)
        spectrum = [[int(edges[i]), int(counts[i])] for i in range(n_bins) if counts[i] > 0]
        peak_lo, _ = max(spectrum, key=lambda pair: pair[1])

        first = group.iloc[0]
        rows.append({
            SAMPLE_KEY: key,      # kept only to merge compute_tectonic_classes() on below
            "Sample_ID": _clean(first["Sample_ID"]),
            "reference": key.split("-S")[0] if "-S" in key else key,
            "Longitude": float(first["Longitude"]),
            "Latitude": float(first["Latitude"]),
            "Age": float(depos_age),
            "Country/Small Region": _clean(first.get("Country/Small Region")),
            "Continent": _clean(first.get("Continent")),
            "Locality": _clean(first.get("Locality")),
            "Class-3 Rock Type": _clean(first.get("Class-3 Rock Type")),
            "n_grains": int(len(ages)),
            "dominant_lag": int(peak_lo + BIN_WIDTH // 2),
            "spectrum": spectrum,
        })

    return pd.DataFrame(rows)


def compute_tectonic_classes(gdf):
    """Cawood et al. (2012) class and Barham et al. (2022, EPSL) ratio, one row per
    sample -- see this module's own docstring for what each means and where it comes
    from. Barham ships as a continuous ratio, not a precomputed class, so the page's own
    JS can threshold it live with a slider rather than baking one split in here.
    """
    from gprm.datasets import Zircons

    # tectonic_category() prints two floats per sample as a debug leftover in gprm's own
    # source -- harmless, but not worth 19,564 lines of noise in this script's output.
    with contextlib.redirect_stdout(io.StringIO()):
        cawood = Zircons.tectonic_category(
            gdf, sample_key=SAMPLE_KEY, grain_age_key=GRAIN_AGE_FIELD,
            depositional_age_key=DEPOS_AGE_FIELD)
        fingerprint = Zircons.tectonic_fingerprint(
            gdf, sample_key=SAMPLE_KEY, grain_age_key=GRAIN_AGE_FIELD,
            depositional_age_key=DEPOS_AGE_FIELD)

    # Both come back from gprm with the groupby index still labelled 'Ref-Sample Key' --
    # the same name the dict literal inside tectonic_category()/tectonic_fingerprint()
    # ALSO uses for an explicit column, so pandas has two things by that name and merge()
    # can't resolve which one is meant without this reset first.
    cawood = cawood.reset_index(drop=True)
    fingerprint = fingerprint.reset_index(drop=True)

    classes = cawood[[SAMPLE_KEY, "TectonicClass"]].rename(
        columns={"TectonicClass": "cawood_class"})

    fingerprint = fingerprint.copy()
    # NaN (fewer than 2 dated grains, nothing to build a spread from) survives the divide
    # and is left as NaN -- export.py's own _clean() turns that into a null on the way
    # out, rather than this script defaulting it to a value as if the statistic existed.
    fingerprint["barham_ratio"] = fingerprint["percentile"] / fingerprint["chi_square"]

    return classes.merge(fingerprint[[SAMPLE_KEY, "barham_ratio"]], on=SAMPLE_KEY, how="left")


def main():
    warnings.filterwarnings("ignore")

    print("loading detrital zircon grains (~1M rows, please be patient)")
    gdf = load_grains()
    print("  {} grain measurements, {} samples".format(len(gdf), gdf[SAMPLE_KEY].nunique()))

    samples = build_samples(gdf)
    total = len(samples)
    print("  {} samples with at least one dated grain".format(total))

    samples = samples.dropna(subset=["Age"])
    samples = samples[samples["Age"] <= END_TIME]
    print("  {} of {} have a depositional age <= {} Ma ({} excluded, see module "
          "docstring)".format(len(samples), total, END_TIME, total - len(samples)))

    print("computing Cawood class / Barham ratio")
    classes = compute_tectonic_classes(gdf)
    samples = samples.merge(classes, on=SAMPLE_KEY, how="left")
    print("  cawood_class counts:\n{}".format(
        samples["cawood_class"].value_counts(dropna=False).to_string()))
    print("  barham_ratio: {} samples, {} without a defined ratio (< 2 dated grains); "
          "at the default slider threshold of 20, {} would classify 'B'".format(
              len(samples), samples["barham_ratio"].isna().sum(),
              (samples["barham_ratio"] > 20).sum()))

    fields = [f for f in FIELDS if f[1] in samples.columns]

    model = load_model(MODEL_NAME)
    export_points(
        samples,
        model_name=MODEL_NAME,
        start=START_TIME, end=END_TIME, step=TIME_STEP,
        transport="rotations",
        fields=fields,
        meta={"source": "Puetz et al. (2026)",
              "doi": "10.1016/j.gsf.2026.102416",
              "bin_width": BIN_WIDTH,
              "max_bin_edge": MAX_BIN_EDGE,
              "caption": (
                  "Detrital zircon samples, Puetz et al. (2026). {} of {} samples with "
                  "at least one dated grain have a depositional age of {} Ma or younger "
                  "and appear on this page; each pie is that sample's own lag-time "
                  "spectrum (grain age minus depositional age), in {} Myr bins.".format(
                      len(samples), total, END_TIME, BIN_WIDTH))},
        out_dir=os.path.join(HERE, "data"),
        model=model,
    )


if __name__ == "__main__":
    main()
