"""
Build this page's boundary + velocity series.

Copied from ../plate-boundaries/build/build_boundaries.py with one change: the time
range runs to 1000 Ma (Merdith2021's own topology limit) instead of 250, so the igneous
zircon record -- which this page is actually about -- is not truncated to the window the
old Scotese raster used to impose. That raster is gone from both pages now, so nothing
else caps the range.

The actual exporter lives in the deep-time-map submodule; this only pins the choices
this particular map makes.

Run:  conda run -n pygmt17 python build/build_boundaries.py
"""

import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(HERE)

sys.path.insert(0, os.path.join(REPO, "shared", "vendor", "deep-time-map", "python"))

from deep_time_map import export_series  # noqa: E402

MODEL_NAME = "Merdith2021"      # Merdith et al. (2021), topologies to 1000 Ma
START_TIME = 0
END_TIME = 1000                 # the page's full span -- see module docstring
TIME_STEP = 1

# Same tessellation as plate-boundaries -- see that page's README for the derivation.
TESSELLATE_DEG = 0.5

HEALPIX_N = 8                   # 12*N^2 = 768 velocity points, ~7 deg apart


def main():
    export_series(
        model_name=MODEL_NAME,
        start=START_TIME,
        end=END_TIME,
        step=TIME_STEP,
        tessellate=TESSELLATE_DEG,
        healpix_n=HEALPIX_N,
        out_dir=os.path.join(HERE, "data"),
    )


if __name__ == "__main__":
    main()
