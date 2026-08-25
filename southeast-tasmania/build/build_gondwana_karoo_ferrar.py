"""Reconstruct Gondwana at 180 Ma and highlight the Karoo-Ferrar large igneous
province, the flood-basalt event associated with the Jurassic dolerites of
Tasmania. Run with: conda run -n pygmt17 python build_gondwana_karoo_ferrar.py

Data sources (local GPlates install):
  Muller et al. (2019) global plate motion model -- rotations + continental
  polygons, https://doi.org/10.1029/2018TC005462
  UTIG LIPs (2011) polygon compilation -- Karoo and Ferrar province outlines
"""
import glob
import os

import geopandas as gpd
import pygmt
import pygplates

MODEL_DIR = os.path.expanduser(
    "~/Data/GPlates/PublishedModels/Muller_etal_2019_PlateMotionModel_v2.0_Tectonics")
CONTINENTS_SHP = os.path.join(
    MODEL_DIR, "StaticGeometries/ContinentalPolygons",
    "Global_EarthByte_GPlates_PresentDay_ContinentalPolygons_2019_v1.shp")
LIPS_SHP = os.path.expanduser(
    "~/Data/GPlates/UTIG/LIPS_shapefiles/lips2011Polygons.shp")

RECON_TIME = 180.0
OUT_PNG = os.path.join(os.path.dirname(__file__), "..", "assets", "gondwana_karoo_ferrar.png")

# Core Gondwana fragments: South America, India, Arabia, Africa + fragments,
# Australia, Antarctica (east + west), Tasmania and its submerged rises.
GONDWANA_PLATE_IDS = {
    201, 283, 2891, 28011, 28900,
    501, 503,
    701, 702, 709, 710, 712, 713, 714, 715,
    801, 802, 804,
    850, 851, 852,
}


def polygon_to_lonlat_rings(polygon_on_sphere):
    lat_lon = polygon_on_sphere.to_lat_lon_array()
    return lat_lon[:, 1], lat_lon[:, 0]


def load_and_reconstruct(shp_path, plate_id_field, rotation_model, time,
                          keep_row=None):
    gdf = gpd.read_file(shp_path)
    if keep_row is not None:
        gdf = gdf[keep_row(gdf)]

    features = []
    for _, row in gdf.iterrows():
        plate_id = int(row[plate_id_field])
        geom = row.geometry
        polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
        for poly in polys:
            lon, lat = poly.exterior.coords.xy
            feature = pygplates.Feature()
            feature.set_geometry(
                pygplates.PolygonOnSphere(list(zip(lat, lon))))
            feature.set_reconstruction_plate_id(plate_id)
            features.append(feature)

    reconstructed = []
    pygplates.reconstruct(features, rotation_model, reconstructed, time)
    return [polygon_to_lonlat_rings(rfg.get_reconstructed_geometry())
            for rfg in reconstructed]


def main():
    rot_files = glob.glob(os.path.join(MODEL_DIR, "*.rot"))
    rotation_model = pygplates.RotationModel(rot_files)

    gondwana = load_and_reconstruct(
        CONTINENTS_SHP, "PLATEID1", rotation_model, RECON_TIME,
        keep_row=lambda gdf: gdf["PLATEID1"].isin(GONDWANA_PLATE_IDS))

    tasmania = load_and_reconstruct(
        CONTINENTS_SHP, "PLATEID1", rotation_model, RECON_TIME,
        keep_row=lambda gdf: gdf["PLATEID1"].isin({850, 851, 852}))

    lip_name_pattern = "KAROO|THERON|WHICHAWAY|DUFEK|TRANSANTARCTIC"
    lips = load_and_reconstruct(
        LIPS_SHP, "plate_code", rotation_model, RECON_TIME,
        keep_row=lambda gdf: gdf["geogdesc"].str.contains(
            lip_name_pattern, case=False, na=False))

    lons = [lon for rings in gondwana for lon in rings[0]]
    lats = [lat for rings in gondwana for lat in rings[1]]
    clon = sum(lons) / len(lons)
    clat = sum(lats) / len(lats)

    def centroid(rings_list):
        xs = [x for rings in rings_list for x in rings[0]]
        ys = [y for rings in rings_list for y in rings[1]]
        return sum(xs) / len(xs), sum(ys) / len(ys)

    karoo_rings = [r for r in lips if sum(r[0]) / len(r[0]) < 60]
    ferrar_rings = [r for r in lips if sum(r[0]) / len(r[0]) >= 60]
    karoo_lon, karoo_lat = centroid(karoo_rings)
    ferrar_lon, ferrar_lat = centroid(ferrar_rings)
    tas_lon, tas_lat = centroid(tasmania)

    fig = pygmt.Figure()
    pygmt.config(
        MAP_FRAME_TYPE="plain",
        MAP_FRAME_PEN="0.75p,#1c2733",
        MAP_GRID_PEN_PRIMARY="0.25p,white@85",
        FONT="14p,Helvetica,#e8f0f8",
    )
    proj = f"G{clon}/{clat}/14c"
    fig.basemap(region="g", projection=proj, frame="g")
    # Same colour for land and water: this is a paleogeographic reconstruction,
    # not today's Earth, so present-day coastlines must not leak through.
    fig.coast(region="g", projection=proj, land="#0a1420", water="#0a1420")

    for lon, lat in gondwana:
        fig.plot(x=lon, y=lat, fill="#3f4a5c", pen="0.4p,#8fa2bd", close=True)

    for lon, lat in tasmania:
        fig.plot(x=lon, y=lat, fill="#5a6c86", pen="1p,#8fd4f0", close=True)

    for lon, lat in lips:
        fig.plot(x=lon, y=lat, fill="#e8672a@20", pen="1.2p,#e8672a", close=True)

    fig.text(x=karoo_lon, y=karoo_lat + 6, text="Karoo", font="16p,Helvetica-Bold,#f0a24a",
              justify="CB", fill="#0a1420@30")
    fig.text(x=ferrar_lon + 6, y=ferrar_lat + 5, text="Ferrar", font="16p,Helvetica-Bold,#f0a24a",
              justify="CB", fill="#0a1420@30")
    fig.text(x=tas_lon, y=tas_lat - 4, text="Tasmania", font="14p,Helvetica-Bold,#8fd4f0",
              justify="CT", fill="#0a1420@30")

    fig.savefig(OUT_PNG, dpi=300, transparent=True)
    print("wrote", OUT_PNG)


if __name__ == "__main__":
    main()
