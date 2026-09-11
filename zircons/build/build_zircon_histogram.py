"""
Build the zircon-age histogram for the time series chart.

Reads data/points.json (written by build_zircons.py) rather than re-fetching or
re-filtering the raw Puetz et al. compilation, so the histogram counts exactly the same
14,167 ages the globe reconstructs -- no separate age cutoff to keep in sync by hand.

Needs only the standard library: this is a bin-and-count over JSON already on disk, none
of the gprm/pygplates stack build_zircons.py itself needs. Runs under plain `python3`;
the `conda run -n pygmt17` wrapper the other build scripts use is unnecessary here but
harmless if used anyway.

Run:  python3 build/build_zircon_histogram.py
(after build/build_zircons.py has produced data/points.json)

---- Why the CSV has two rows per bin, not one -------------------------------------------

js/story.js's time-series chart (deep-time-map's TimeSeriesSet) only strokes a line
through its samples -- there is no bar/rectangle-fill mode, and this script does not try
to add one to the vendored library for a single page's histogram.

A step-histogram look is producible from a plain line renderer by writing each bin's
count at BOTH its start and end time. Two neighbouring bins then share one time value
with two different counts (bin k's end == bin k+1's start), which draws as a near-vertical
riser between them, and a flat run of identical values across one bin's own span draws as
a plateau. Net effect: a proper-looking stepped histogram, using only the line-drawing
code every other row on this chart already uses.
"""

import csv
import json
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

START_TIME = 0
END_TIME = 1000
BIN_WIDTH = 20          # Myr. (1000 - 0) / 20 = 50 bins, no remainder.


def main():
    points_path = os.path.join(HERE, "data", "points.json")
    with open(points_path) as fh:
        payload = json.load(fh)

    n_bins = (END_TIME - START_TIME) // BIN_WIDTH
    counts = [0] * n_bins

    skipped = 0
    for point in payload["points"]:
        age = point.get("age")
        if age is None or age < START_TIME or age > END_TIME:
            skipped += 1
            continue
        # age == END_TIME belongs in the last bin, not a 51st one-sample bin.
        i = min(n_bins - 1, int((age - START_TIME) // BIN_WIDTH))
        counts[i] += 1

    out_path = os.path.join(HERE, "data", "zircon_histogram.csv")
    with open(out_path, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["time_ma", "zircon_count"])
        for i, count in enumerate(counts):
            lo = START_TIME + i * BIN_WIDTH
            hi = lo + BIN_WIDTH
            writer.writerow([lo, count])
            writer.writerow([hi, count])

    total = sum(counts)
    peak_i = max(range(n_bins), key=lambda i: counts[i])
    print("{} points binned, {} skipped (age outside 0-1000 Ma)".format(total, skipped))
    print("peak bin: {}-{} Ma, {} samples".format(
        START_TIME + peak_i * BIN_WIDTH, START_TIME + (peak_i + 1) * BIN_WIDTH,
        counts[peak_i]))
    print("wrote {} ({} bins, {} rows)".format(out_path, n_bins, n_bins * 2))


if __name__ == "__main__":
    main()
