"""
Neoproterozoic glaciations as dated intervals.

Why this is a separate file from the glacial-extent curve
--------------------------------------------------------
The page already draws `ice_extent` from Macdonald's `IceExtent_Myr.csv`, a continuous
latitude-of-ice-margin series. That file STOPS AT 525 Ma. Everything older than the
Cambrian was therefore blank -- which on a page whose deep-time end is the Cryogenian meant
the single most important climate events in the window were simply absent.

They cannot be added to that series, because they are not the same kind of measurement. The
Phanerozoic record is an extent through time; the Cryogenian record is a set of BRACKETS --
"the onset lies between these two dated horizons". Forcing the second into the shape of the
first would invent a continuity the geochronology does not have. So they ship separately and
are drawn separately: a curve for the extent, interval bars for the glaciations.

Source
------
Hoffman, P.F., Abbot, D.S., Ashkenazy, Y., Benn, D.I., Brocks, J.J., Cohen, P.A., Cox, G.M.,
Creveling, J.R., Donnadieu, Y., Erwin, D.H., Fairchild, I.J., Ferreira, D., Goodman, J.C.,
Halverson, G.P., Jansen, M.F., Le Hir, G., Love, G.D., Macdonald, F.A., Maloof, A.C.,
Partin, C.A., Ramstein, G., Rose, B.E.J., Rose, C.V., Sadler, P.M., Tziperman, E., Voigt, A.
& Warren, S.G. (2017), "Snowball Earth climate dynamics and Cryogenian geology-geobiology",
Science Advances 3(11), e1600983.

The four brackets below are its Table 1 headline ranges, copied verbatim. They are not
re-derived, re-fitted or rounded here.

    Sturtian glacial onset:                717.5 to 716.3 Ma
    Sturtian deglaciation/cap carbonate:   659.3 to 658.5 Ma
    Marinoan glacial onset:                649.9 to 639.0 Ma
    Marinoan deglaciation/cap carbonate:   636.0 to 634.7 Ma

Note what those numbers do on their own, with no comment from this page: three of the four
boundaries are pinned to a little over 1 Myr, and the fourth is loose over 10.9 Myr. The
Marinoan onset is the one nobody can date, because it is bracketed only by a pre-Marinoan
Re-Os age of 645.1 +/- 4.8 Ma in South Australia and a syn-Marinoan U-Pb age of
639.3 +/- 0.3 Ma from the Ghaub Formation in Namibia. The chart draws each bracket at its
real width, so that asymmetry is visible rather than described.

Gaskiers is Ediacaran and outside Hoffman et al.'s scope, so it carries its own source:

Pu, J.P., Bowring, S.A., Ramezani, J., Myrow, P., Raub, T.D., Landing, E., Mills, A.,
Hodgin, E. & Macdonald, F.A. (2016), "Dodging snowballs: Geochronology of the Gaskiers
glaciation and the first appearance of the Ediacaran biota", Geology 44(11), 955-958.

Its two dates BRACKET the diamictite rather than dating the glaciation's start and end --
deposition occurred after 580.90 +/- 0.40 Ma and before 579.88 +/- 0.44 Ma -- so the real
event is shorter than the bar and sits inside it. `bracketing: true` records that, and the
page says so rather than letting a ~1 Myr bar imply a measured duration.

Run:  python3 build/build_glaciations.py      (stdlib only -- no conda env needed)
"""

import json
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CITATION = (
    "Hoffman, P.F. et al. (2017), Snowball Earth climate dynamics and Cryogenian "
    "geology-geobiology, Science Advances 3(11), e1600983; Table 1. Gaskiers from "
    "Pu, J.P. et al. (2016), Dodging snowballs: Geochronology of the Gaskiers glaciation "
    "and the first appearance of the Ediacaran biota, Geology 44(11), 955-958."
)

NOTE = (
    "Published brackets, copied verbatim. Each boundary is a range because that is what "
    "the geochronology gives: the age is known to lie between two dated horizons. Ranges "
    "are drawn at their real width, so a well-dated boundary looks different from a poorly "
    "dated one."
)

# [older, younger] in Ma for each boundary, exactly as the sources state them.
GLACIATIONS = [
    {
        "name": "Sturtian",
        "onset": [717.5, 716.3],
        "termination": [659.3, 658.5],
        "bracketing": False,
        "source": "Hoffman et al. (2017), Table 1",
        "note": "Onset coincides with the ~717 Ma Franklin LIP.",
    },
    {
        "name": "Marinoan",
        "onset": [649.9, 639.0],
        "termination": [636.0, 634.7],
        "bracketing": False,
        "source": "Hoffman et al. (2017), Table 1",
        "note": ("Onset constrained only between a pre-Marinoan Re-Os age of "
                 "645.1 ± 4.8 Ma (South Australia) and a syn-Marinoan U-Pb age of "
                 "639.3 ± 0.3 Ma (Ghaub Fm, Namibia) — a 10.9 Myr window, against "
                 "~1 Myr for the other three boundaries."),
    },
    {
        "name": "Gaskiers",
        "onset": [580.90, 580.90],
        "termination": [579.88, 579.88],
        "bracketing": True,
        "source": "Pu et al. (2016)",
        "note": ("Bracketing ash beds, not the glaciation's own start and end: the "
                 "diamictite was deposited after 580.90 ± 0.40 Ma and before "
                 "579.88 ± 0.44 Ma, so the event is shorter than the bar and lies "
                 "inside it."),
    },
]


def main():
    out = os.path.join(HERE, "data", "glaciations.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    payload = {
        "meta": {"source": CITATION, "note": NOTE},
        "glaciations": GLACIATIONS,
    }
    with open(out, "w") as fh:
        json.dump(payload, fh, indent=1)

    for g in GLACIATIONS:
        span = g["onset"][0] - g["termination"][1]
        worst = max(g["onset"][0] - g["onset"][1],
                    g["termination"][0] - g["termination"][1])
        print("  {:<10} {:>6.1f} -> {:>6.1f} Ma  ({:.1f} Myr; widest bracket {:.1f} Myr)"
              .format(g["name"], g["onset"][0], g["termination"][1], span, worst))
    print("{} ({:.1f} kB)".format(os.path.relpath(out, HERE),
                                  os.path.getsize(out) / 1e3))


if __name__ == "__main__":
    main()
