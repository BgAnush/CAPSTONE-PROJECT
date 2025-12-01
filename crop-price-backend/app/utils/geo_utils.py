from geopy.distance import geodesic
import pandas as pd

district_coords_df = pd.read_csv("app/data/Coordinate_Dataset.csv")

def get_nearby_districts(lat: float, lon: float, max_distance_km: int = 250):
    nearby = []
    for _, row in district_coords_df.iterrows():
        dlat, dlon = row["Latitude"], row["Longitude"]
        dist = geodesic((lat, lon), (dlat, dlon)).km
        if dist <= max_distance_km:
            nearby.append((row["State"], row["District"], dist))
    return sorted(nearby, key=lambda x: x[2])
