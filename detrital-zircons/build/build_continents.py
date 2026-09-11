"""
Build this page's reconstructed continent polygons.

Copied from ../plate-boundaries/build/build_continents.py, extended to 1000 Ma to match
build_boundaries.py -- see that script's docstring for why. Merdith2021 carries continent
polygons but no coastlines, so `continents` is the only polygon set available here.

Geometry ships once at its present-day position with an Euler pole and angle per plate per
time; the browser rotates it.

Run:  conda run -n pygmt17 python build/build_continents.py
"""

import os
import sys
import warnings

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(HERE)

sys.path.insert(0, os.path.join(REPO, "shared", "vendor", "deep-time-map", "python"))

from deep_time_map import export_polygons  # noqa: E402

MODEL_NAME = "Merdith2021"
START_TIME = 0
END_TIME = 1000
TIME_STEP = 1

# Same simplification tolerance as plate-boundaries -- see that page's README for the
# derivation (tied to one device pixel at this page's own max zoom).
TOLERANCE_DEG = 0.02


def main():
    warnings.filterwarnings("ignore")
    export_polygons(
        model_name=MODEL_NAME,
        start=START_TIME, end=END_TIME, step=TIME_STEP,
        which="continents",
        tolerance=TOLERANCE_DEG,
        out_dir=os.path.join(HERE, "data"),
    )


if __name__ == "__main__":
    main()
