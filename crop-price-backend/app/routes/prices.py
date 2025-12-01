from fastapi import APIRouter
from app.services.crop_service import fetch_crop_prices
from app.utils.geo_utils import get_nearby_districts
import pandas as pd

router = APIRouter()

@router.get("/crop-prices")
def get_crop_prices(lat: float, lon: float, crop: str):
    nearby_districts = get_nearby_districts(lat, lon)
    if not nearby_districts:
        return {"error": "No nearby districts found"}

    states_to_check = sorted(set([s for s, _, _ in nearby_districts]))
    for state in states_to_check:
        df_state = fetch_crop_prices(state, crop.title().strip())
        if df_state.empty:
            continue

        # Convert Modal_Price to numeric and divide by 100 to get ₹
        df_state["Modal_Price_num"] = pd.to_numeric(df_state["Modal_Price"], errors="coerce") / 100
        df_state["Arrival_Date_dt"] = pd.to_datetime(df_state["Arrival_Date"], format="%d/%m/%Y", errors="coerce")
        df_state = df_state.dropna(subset=["Modal_Price_num", "Arrival_Date_dt"])

        nearby_names = [d for s, d, _ in nearby_districts if s == state]
        df_nearby = df_state[df_state["District"].isin(nearby_names)]
        if df_nearby.empty:
            continue

        df_latest = df_nearby.sort_values("Arrival_Date_dt").groupby("Market").tail(1)
        df_top5 = df_latest.sort_values("Modal_Price_num", ascending=False).head(5)

        prices_kg = df_top5["Modal_Price_num"].tolist()
        # Add ₹5 to min, median, max
        min_price = round(min(prices_kg) + 5, 2)
        median_price = round(sorted(prices_kg)[len(prices_kg)//2] + 5, 2)
        max_price = round(max(prices_kg) + 5, 2)

        return {
            "state": state,
            "crop": crop,
            "top5": df_top5.to_dict(orient="records"),
            "analysis": {
                "min_price": min_price,
                "median_price": median_price,
                "max_price": max_price
            }
        }

    return {"message": f"No {crop} records found in nearby states"}
