"""
Build reconstructed continent polygons for EVERY model the page offers.

One file per model, because selecting a reconstruction has to move the whole map and not
just the suture layer -- see build/models.py for why that is a rule here rather than a
nicety. Copied from ../zircons/build/build_continents.py with TIME_STEP raised to 5 to
match build_boundaries.py -- see that script's docstring for why this page does not run at
1 Myr.

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

sys.path.insert(0, os.path.join(HERE, "build"))
from models import MODELS, START_TIME, END_TIME, TIME_STEP, load, model_dir  # noqa: E402

TOLERANCE_DEG = 0.02


def main():
    warnings.filterwarnings("ignore")
    data = os.path.join(HERE, "data")
    for name, spec in MODELS.items():
        print("=== {} ===".format(name))
        export_polygons(
            model_name=name,
            # Local-file models are not gprm-fetchable by name, so hand the object over.
            model=load(name),
            start=START_TIME, end=END_TIME, step=TIME_STEP,
            which=spec["polygons"],
            anchor_plate=spec["anchor_plate"],
            tolerance=TOLERANCE_DEG,
            out_dir=model_dir(data, name),
            filename="continents.json",
        )


if __name__ == "__main__":
    main()
