from fastapi import FastAPI
from app.routes import prices
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Create FastAPI app
app = FastAPI(
    title="Crop Recommendation & Prices API",
    version="1.0",
    description="API to provide crop recommendations and pricing information"
)

# ✅ Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



app.include_router(prices.router)
