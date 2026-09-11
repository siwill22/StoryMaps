"""
Build this page's boundary-length time series.

Identical to ../plate-boundaries/build/build_timeseries.py -- the computation lives in
the deep-time-map submodule and reads whatever frames are in data/, so it automatically
covers this page's 0-1000 Ma range once build_boundaries.py has run.

Run:  conda run -n pygmt17 python build/build_timeseries.py
"""

import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(HERE)

sys.path.insert(0, os.path.join(REPO, "shared", "vendor", "deep-time-map", "python"))

from deep_time_map import boundary_length_series  # noqa: E402


def main():
    boundary_length_series(os.path.join(HERE, "data"))


if __name__ == "__main__":
    main()
