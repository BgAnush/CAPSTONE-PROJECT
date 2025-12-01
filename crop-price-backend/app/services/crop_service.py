import os
import requests
import pandas as pd
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("API_KEY")
URL = os.getenv("BASE_URL")

def fetch_crop_prices(state: str, crop: str, days: int = 7):
    today = datetime.today()
    dates = [(today - timedelta(days=i)).strftime("%d-%m-%Y") for i in range(1, days + 1)]

    all_records = []
    for d in dates:
        params = {
            "api-key": API_KEY,
            "format": "json",
            "limit": 5000,
            "filters[State]": state,
            "filters[Commodity]": crop,
            "filters[Arrival_Date]": d
        }
        resp = requests.get(URL, params=params).json()
        records = resp.get("records", [])
        for r in records:
            all_records.append({
                "State": r.get("State"),
                "District": r.get("District"),
                "Market": r.get("Market"),
                "Arrival_Date": r.get("Arrival_Date"),
                "Modal_Price": r.get("Modal_Price")
            })

    return pd.DataFrame(all_records)
