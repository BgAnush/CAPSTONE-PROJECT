**🌾 Namma Raitha – Direct Market Access for Farmers**
Namma Raitha is a mobile application built using React Native (Expo) to connect farmers directly with retailers and consumers.
The aim is to ensure fair pricing, eliminate middlemen, and provide farmers with modern digital tools to improve their income and productivity.

⭐ Features
**👨‍🌾 For Farmers**

Add, update, and delete produce

AI-based plant disease detection

Weather-based suggestions

Real-time price insights using government data

View and manage retailer orders

Multi-language support (English & Kannada)

**🛒 For Retailers**

Browse produce directly from farmers

Negotiate price and quantity

Place orders instantly

Track order status

**🔧 Common Features**

Supabase Authentication (Email/Password)

Secure login using react-native-keychain

FastAPI backend with Supabase PostgreSQL

Image upload & storage

Smooth UI with animations

Push notifications (upcoming)

**🛠️ Tech Stack
Frontend**

React Native (Expo)

React Navigation

Axios

Supabase JS

AsyncStorage

React Native Keychain

**Backend**

FastAPI

Python

PostgreSQL (Supabase)

Pydantic

Uvicorn

**🚀 Installation & Setup**
1. Clone the Project
git clone https://github.com/yourusername/namma-raitha.git
cd namma-raitha

**2. Install Dependencies**
npm install

**3. Start the Expo App**
npx expo start

**4. Run on Mobile**

Install Expo Go

Scan the QR code

**⚙️ Backend Setup (FastAPI)**
Install Backend Requirements
pip install fastapi uvicorn supabase psycopg2 python-dotenv pydantic

**Run Backend**
uvicorn main:app --reload

**Example .env**
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
DATABASE_URL=your_postgres_url
GEMINI_API_KEY=your_api_key

**🔗 API Endpoints (Examples)**
Authentication

POST /signup – Create account

POST /login – Login

Farmer

POST /farmer/addProduce

GET /farmer/getProduce/{id}

Retailer

GET /retailer/getAllProduce

POST /retailer/order

AI

POST /ai/detectDisease – Analyze crop disease

📌 Project Status

✔ Authentication working

✔ Farmer & Retailer dashboards

✔ Produce upload

✔ Image storage

✔ AI disease detection

⬜ Notifications

⬜ Chat system

⬜ Wallet/Payments

**📄 Future Enhancements**

Real-time chat

Payment gateway

Delivery tracking

Blockchain-based pricing transparency

**👨‍💻 Developer**

Anush B G
Final Year Project – Namma Raitha
