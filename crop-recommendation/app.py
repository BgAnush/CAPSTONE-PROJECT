import tensorflow as tf
import numpy as np
import joblib
from fastapi import FastAPI
from pydantic import BaseModel

model = tf.keras.models.load_model("crop_recommendation_model.h5")
scaler = joblib.load("scaler.pkl")
le = joblib.load("label_encoder.pkl")

app = FastAPI(title="Crop Recommendation API")

class CropInput(BaseModel):
    N: float
    P: float
    K: float
    temperature: float
    humidity: float
    ph: float
    rainfall: float

@app.post("/predict")
def predict_crop(data: CropInput):
    features = [data.N, data.P, data.K, data.temperature, data.humidity, data.ph, data.rainfall]
    sample = np.array([features])
    sample_scaled = scaler.transform(sample)
    pred = model.predict(sample_scaled)[0]
    top5_idx = pred.argsort()[-5:][::-1]
    results = [{"crop": le.inverse_transform([i])[0], "confidence": float(pred[i])*100} for i in top5_idx]
    return {"recommendations": results}
