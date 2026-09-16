"""
Build the boundary + velocity series for every model that has topologies.

Copied from ../zircons/build/build_boundaries.py with one change: TIME_STEP is 5, not 1.

That is deliberate and is the page's own decision, not a shortcut. Three reasons, in
order of how much they mattered:

1. 1 Myr steps imply a temporal precision the inputs do not have. Macdonald's suture
   output is 5 Myr; Cao's arc lengths are 10 Myr bins; GEOCARB is 10 Myr. On a page whose
   whole subject is over-stated precision, shipping 1 Myr frames would be the wrong
   implication to make in the first thing a reader touches.
2. This globe's job is showing which features fall inside a latitude belt, which changes
   on tens of Myr. Nobody perceives 1 against 5 Myr while scrubbing.
3. ../zircons/data/frames is 90 MB for ONE model at 1 Myr. This page wants several models
   on the globe so that switching model is a real interaction rather than a chart-only
   abstraction. At 5 Myr that is ~18 MB per model, which is affordable; at 1 Myr it is not.

Cost accepted: playback is slightly steppier than on the sibling pages.

Run:  conda run -n pygmt17 python build/build_boundaries.py
"""

import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(HERE)

sys.path.insert(0, os.path.join(REPO, "shared", "vendor", "deep-time-map", "python"))

from deep_time_map import export_series  # noqa: E402

sys.path.insert(0, os.path.join(HERE, "build"))
from models import MODELS, START_TIME, END_TIME, TIME_STEP, model_dir  # noqa: E402

# Same tessellation as the sibling pages -- see plate-boundaries' README for the derivation.
TESSELLATE_DEG = 0.5

HEALPIX_N = 8                   # 12*N^2 = 768 velocity points, ~7 deg apart


def main():
    data = os.path.join(HERE, "data")
    for name, spec in MODELS.items():
        if not spec["topologies"]:
            # Rotations and static polygons only -- no closed plates, so there are no
            # boundaries to resolve and no velocity field to sample. The page draws
            # neither for this model and says why, rather than borrowing another
            # model's and implying they belong to this one.
            print("{}: no topologies, skipping boundaries".format(name))
            continue
        print("=== {} ===".format(name))
        export_series(
            model_name=name,
            start=START_TIME,
            end=END_TIME,
            step=TIME_STEP,
            # A no-op for the models built today (Merdith2021 anchors on 0, and the one
            # model that anchors on 1 has no topologies), but the anchor belongs to the
            # model rather than to any one export -- see build/models.py.
            anchor_plate=spec["anchor_plate"],
            tessellate=TESSELLATE_DEG,
            healpix_n=HEALPIX_N,
            out_dir=model_dir(data, name),
        )


if __name__ == "__main__":
    main()
