"""
The models this page can reconstruct in, declared once.

Every build script imports this rather than keeping its own list, so a model cannot end up
with (say) sutures but no continents, or continents built at a different time step from the
boundaries they are drawn over.

Why each model's OWN polygons, not one model's polygons for all of them
----------------------------------------------------------------------
Changing the reconstruction changes where everything is, not just the layer the page
happens to be about. Drawing Merdith2021 continents under Torsvik & Cocks sutures would put
collisions in the sea and coastlines in the wrong hemisphere, and -- worse for this page --
it would make the model control look like it did less than it does, since most of the map
would not move. So each model ships its own continents (and its own boundaries, where it
has topologies), and selecting a model switches all of them together.

Layout this produces:

    data/<Model>/continents.json          every model
    data/<Model>/sutures.json             every model
    data/<Model>/boundaries.json          topological models only
    data/<Model>/frames/…                 topological models only
    data/<Model>/velocities.json          topological models only
    data/macdonald2019.json               model-independent, published series

A model with `topologies: False` has rotations and static polygons but no closed plates, so
no boundary lengths and no velocity field exist for it. That is a capability difference, not
a ranking -- it can still place a suture at a latitude, which is all this driver needs.

Anchor plate
------------
`anchor_plate` is part of the model, not a control the reader is offered: which plate the
reconstruction is held fixed to is a property of how a model is meant to be used, and
getting it wrong is a mistake rather than an alternative. It lives here, next to the model's
plate-ID column and its topology capability, for the same reason the data directory does --
so a model's conventions travel with it.

    Merdith2021       0    its 001-relative-to-000 sequence is identity at every sampled
                           time, so 0 and 1 are the same reconstruction. Recorded anyway.

    TorsvikCocks2017  1    001 IS THE SPIN AXIS in this model, and 000 is not. Measured:
                           the rotation file carries a 29-sample 001-relative-to-000
                           sequence over 0-600 Ma about an equatorial Euler pole at
                           (0, 11E) -- -28 degrees at 400 Ma, -55 at 500 Ma -- which moves
                           paleolatitude by up to ~9 degrees. On a page whose whole subject
                           is which sutures sit in a +-10 to +-40 degree band, that is not
                           a detail: it moves sutures in and out of the band wholesale.

                           The value is not inferred from the file's structure (which is
                           misleading -- plate 701 chains to 000, not to 001). It is what
                           the source's own analysis used: Macdonald's suture_analysis.ipynb
                           sets `anchor = 1  #anchor plate ID (1 : spin axis)` for every
                           pygplates.reconstruct call.

Beyond the span of a model's anchor sequence the anchor rotation quietly becomes the
identity, which would change reference frame mid-record without saying so. build_sutures.py
tests validity by building the reconstruction tree ON THE ANCHOR at each timestep, so plates
past that span drop out instead of the frame slipping.

Two CEEDs
---------
"Torsvik & Cocks 2017" names two different rotation files here, and the difference is not
cosmetic:

    TorsvikCocks2017        gprm's `Torsvik_Cocks_HybridRotationFile.rot`.
    TC2017_SHM2017_D2018    the file Macdonald's own notebook loads, from his repository.
                            TC2017 + Swanson-Hysell & Macdonald + Domeier 2018.

Measured on anchor 1 at 445 Ma they place Laurentia (plate 101) 13 degrees apart in latitude
(-19.1 vs -6.5) and Avalonia (303) 12 degrees apart, while Baltica (302) is identical to the
decimal. That is not a rounding difference: it decides whether the Laurentian sutures fall
inside a +-15 degree band during the Late Ordovician, and it roughly halves tropical suture
length at the Hirnantian.

The SHM edits are two poles on plate 101, at 444 and 477 Ma, and the file says in its own
comments what they are for -- "keeps Laurentia equatorward of Winterville Volcanics" and
"5 degrees equatorward of Moretons Harbor data (allowing for Taconic seaway)". They are
argued from palaeomagnetic data and are not hidden. But they are an adjustment to the
quantity the published conclusion turns on, made inside the reconstruction that conclusion
then cites as evidence, at exactly the times it depends on. Both files are offered so a
reader can see that for themselves rather than be told it.

Local models
------------
Most entries are fetched by gprm name. An entry carrying a `local` dict instead names files
on disk: `rotations` and `continents`, both expanded with `~`. `load(name)` returns either
kind as an object exposing `.rotation_model` and `.continent_polygons`, which is all the
build scripts and deep_time_map's `export_polygons(model=...)` need.
"""

MODELS = {
    "Merdith2021": {
        # Column in the source suture table carrying this model's plate IDs. Established
        # by test, not by the column name -- see build_sutures.py's docstring.
        "plate_id_column": "PLATEID1",
        "topologies": True,
        "polygons": "continents",
        "anchor_plate": 0,
        "label": "Merdith et al. 2021",
        "lineage": "Merdith / EarthByte",
    },
    "TorsvikCocks2017": {
        "plate_id_column": "PLATEID_CE",
        "topologies": False,
        "polygons": "continents",
        "anchor_plate": 1,          # spin axis -- see "Anchor plate" above
        "label": "Torsvik & Cocks 2017 (CEED)",
        "lineage": "Torsvik / CEED",
    },
    # The rotation file the published analysis actually ran on -- see "Two CEEDs" below.
    "TC2017_SHM2017_D2018": {
        "plate_id_column": "PLATEID_CE",
        "topologies": False,
        "polygons": "continents",
        "anchor_plate": 1,
        "label": "CEED + Swanson-Hysell & Macdonald + Domeier",
        "lineage": "Torsvik / CEED · source's own file",
        "local": {
            "rotations": [
                "~/GIT/Tectonic/Arc_Continent_Analysis-master/paleogeo_models/"
                "TC2017_SHM2017_D2018.rot",
            ],
            # The notebook draws CEED6+Kazakh over CEED6_LAND. The Kazakh blocks carry the
            # Domeier plate IDs the rotation file adds, so they are the set that matches it.
            "continents": [
                "~/GIT/Tectonic/Arc_Continent_Analysis-master/paleogeo_models/"
                "CEED6+Kazakh/CEED6+D18_Kazakh.shp",
            ],
        },
    },
}

START_TIME = 0

# 800 Ma, not 1000. Only Merdith2021 reaches the earliest Neoproterozoic at all, and the
# suture compilation itself thins to almost nothing before ~800 Ma, so the extra 200 Myr
# was a mostly-empty axis that made every earlier signal narrower on screen.
END_TIME = 800

# 5 Myr, not 1. See build_boundaries.py's docstring for why this page deliberately runs
# coarser than its siblings.
TIME_STEP = 5


def model_dir(data_dir, name):
    import os
    return os.path.join(data_dir, name)


class _LocalModel(object):
    """A reconstruction assembled from files on disk rather than fetched by gprm.

    Exposes the handful of attributes the build scripts and deep_time_map actually use, so
    it is interchangeable with a gprm model object at every call site.
    """

    def __init__(self, name, rotations, continents):
        import os
        import pygplates

        self.name = name
        self.rotation_files = [os.path.expanduser(p) for p in rotations]
        self.continent_polygons = [os.path.expanduser(p) for p in continents]
        for path in self.rotation_files + self.continent_polygons:
            if not os.path.exists(path):
                raise SystemExit("{}: missing {}".format(name, path))
        self.rotation_model = pygplates.RotationModel(self.rotation_files)
        # Present so `which='coastlines'`/`'static'` fail cleanly rather than by AttributeError.
        self.coastlines = []
        self.static_polygons = []

    def plate_snapshot(self, *args, **kwargs):
        raise SystemExit(
            "{} has no topologies -- see MODELS[...]['topologies']".format(self.name))


def load(name):
    """The reconstruction for a registry entry, gprm-fetched or built from local files."""
    spec = MODELS[name]
    local = spec.get("local")
    if local:
        return _LocalModel(name, local["rotations"], local["continents"])
    from gprm.datasets import Reconstructions
    return getattr(Reconstructions, "fetch_{}".format(name))()
