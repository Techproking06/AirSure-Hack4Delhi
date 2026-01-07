# 🌬️ AirSure — Delhi Ward-Level Air Quality Monitoring & Governance Platform

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Data: Real APIs](https://img.shields.io/badge/Data-Real%20APIs-blue.svg)](#-data-sources)

> **Real-Time Air Intelligence for Safer Cities (Delhi)**

AirSure is a production-ready civic-tech platform for real-time air quality monitoring and governance at the **ward level in Delhi**. It provides data-driven insights for **citizens**, **ward officers**, and **MCD administrators**, including **stubble burning (parali) impact signals**, weather context, and ward-level analytics.

---

## 📋 Table of Contents

- [🎯 Overview](#-overview)
- [✨ Features](#-features)
- [🏗 Architecture](#-architecture)
- [📁 Project Structure](#-project-structure)
- [📊 Data Sources](#-data-sources)
- [🧮 Ward-Level AQI Computation](#-ward-level-aqi-computation)
- [🚀 Setup & Installation](#-setup--installation)
- [⚙️ Configuration](#️-configuration)
- [🖥️ Running the Application](#️-running-the-application)
- [📡 API Endpoints](#-api-endpoints)
- [☁️ Deployment](#️-deployment)
- [🔐 Authentication & Roles](#-authentication--roles)
- [✅ Real Data Guarantee](#-real-data-guarantee)
- [🛡 Compliance & Legal](#-compliance--legal)
- [⚠️ Disclaimer](#️-disclaimer)
- [🙏 Acknowledgments](#-acknowledgments)
- [🔗 Official Sources](#-official-sources)
- [📞 Support](#-support)

---

## 🎯 Overview

AirSure provides:

- **Real-time AQI monitoring** from CPCB-linked stations via OpenAQ (and optional cross-validation)
- **Ward-level AQI estimation** using spatial fusion/interpolation across nearby stations
- **Satellite-based fire detection** using NASA FIRMS (VIIRS/MODIS) for parali/stubble-burning signals
- **Weather and wind analysis** using WeatherAPI.com for context and smoke transport indicators
- **Role-based access** for Citizens, Ward Officers, and Administrators
- **Complaint management system** for citizen engagement
- **Policy simulation tools** for scenario planning (if enabled in your build)

---

## ✨ Features

### For Citizens
- 👀 View real-time AQI across Delhi
- 📍 Interactive map with station-wise and ward-level data
- 📝 Submit and track pollution complaints (if enabled)
- 🏥 Health advisories based on current AQI category

### For Governance (Ward Officers / Admin)
- 📊 Ward/zone AQI performance dashboards
- 📋 Complaint management and resolution tracking
- ⚖️ Issue notices, penalties, and advisories (actions module)
- 📈 Performance statistics and metrics

### Intelligence Modules
- 🔥 Stubble burning (parali) detection from satellite data
- 💨 Wind direction / corridor analysis for smoke transport context
- 🧪 Policy simulator with real baseline data (if enabled)
- 🧠 AI-driven impact assessments (if included in your build)

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  HTML/CSS/JavaScript  │  Maps (Leaflet)  │  Role-Based UI │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Node.js/Express)                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │   routes.js   │   server.js   │   services/              │   │
│  │               │               │   ├── aqi.js             │   │
│  │               │               │   ├── weather.js         │   │
│  │               │               │   └── satellite.js       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
   │   OpenAQ    │    │ WeatherAPI  │    │ NASA FIRMS  │
   │   (AQI)     │    │  (Weather)  │    │ (Satellite) │
   └─────────────┘    └─────────────┘    └─────────────┘
```

**Key Principles**
- Frontend NEVER calls external APIs directly
- All API keys are secured in backend `.env`
- Real data only (no mock/simulated values by default)
- Clear source attribution for all data

---

## 📁 Project Structure

```
AIRSURE/
├── backend/
│   ├── data/
│   │   ├── wards.json          # 250 Delhi wards with geospatial data
│   │   └── stations.json       # Real AQI monitoring stations
│   ├── services/
│   │   ├── aqi.js              # AQI computation & integrations
│   │   ├── weather.js          # WeatherAPI integration
│   │   └── satellite.js        # NASA FIRMS (+ optional satellite layers)
│   ├── routes.js               # API endpoints
│   ├── server.js               # Express server
│   └── package.json            # Dependencies
│
├── frontend/
│   ├── index.html              # Main application (Login + App)
│   ├── script.js               # Frontend logic
│   └── style.css               # Styling
│
└── README.md
```

> Note: Some repos may use `Backend/` and `Frontend/` (capitalized). Adjust paths accordingly.

---

## 📊 Data Sources

### Air Quality Data
- **Primary**: CPCB-linked monitoring stations (availability depends on upstream access)
- **Aggregation**: OpenAQ
- **Cross-validation (optional)**: WAQI (AQICN)

### Weather Data
- **Provider**: WeatherAPI.com

### Satellite Data
- **Fire Detection**: NASA FIRMS (MODIS/VIIRS)
- **Air Quality Context (optional)**: Copernicus Sentinel-5P (TROPOMI)
- **Geospatial (optional)**: ISRO Bhuvan

### Getting API Keys

1. **NASA FIRMS MAP KEY**
   - https://firms.modaps.eosdis.nasa.gov/api/area/
   - Create a free NASA Earthdata account
   - Request a MAP KEY for the FIRMS API

2. **WeatherAPI Key**
   - https://www.weatherapi.com/signup.aspx
   - Create account and copy API key from dashboard

---

## 🧮 Ward-Level AQI Computation

AirSure computes **ward-level AQI** using station measurements and geospatial methods.

**Scientific Methodology**
1. **Multi-Station Fusion**: Aggregate readings from nearby monitoring stations
2. **Spatial Interpolation**: Inverse Distance Weighting (IDW) for ward boundaries
3. **Weather Context/Correction (optional)**: Use wind speed/direction and temperature for context
4. **AQI Breakpoint Formula**: Standard sub-index breakpoint computation

**Formula**
```
AQI = ((I_high - I_low) / (C_high - C_low)) × (C - C_low) + I_low
```

**UI Disclaimer (Recommended)**
> “Ward AQI is computationally derived using spatial interpolation of nearby certified monitoring stations.”

### AQI Categories (Indian NAQI)
| AQI Range | Category | Color |
|----------:|----------|-------|
| 0–50 | Good | Green |
| 51–100 | Satisfactory | Light Green |
| 101–200 | Moderate | Yellow |
| 201–300 | Poor | Orange |
| 301–400 | Very Poor | Red |
| 401–500 | Severe | Dark Red |

---

## 🚀 Setup & Installation

### Prerequisites
- Node.js v18+
- npm or yarn
- Internet connection for API access

### Backend Setup

1. Navigate to backend:
```bash
cd AIRSURE/backend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file in `backend/`:
```bash
touch .env
```

---

## ⚙️ Configuration

Add the following to `backend/.env`:

```env
# Server
PORT=5000
NODE_ENV=production

# Weather
WEATHER_API_KEY=your_weatherapi_com_key

# NASA FIRMS (some builds use one name or the other; setting both is safe)
NASA_FIRMS_MAP_KEY=your_nasa_firms_key
NASA_FIRMS_API_KEY=your_nasa_firms_key

# Optional / if applicable in your build
CPCB_API_KEY=your_cpcb_api_key_if_applicable
SENTRY_DSN=optional_error_monitoring
```

**Notes**
- The platform can run without satellite/weather keys, but those modules will return errors or show empty states.
- Keep API keys in environment variables only (never commit them to GitHub).

---

## 🖥️ Running the Application

### Development Mode
```bash
cd AIRSURE/backend
npm start
```

### Access
- **Frontend:** `http://localhost:5000` (or your configured `PORT`)
- **API Base:** `http://localhost:5000/api`
- **Health Check (if implemented):** `http://localhost:5000/api/health`

### Login / Roles
Email-based login with role selection (implementation-dependent):
- **Citizen** — View AQI, submit complaints
- **Ward Officer** — Ward analytics, complaint management
- **Admin/MCD** — Full access including enforcement/actions

---

## 📡 API Endpoints

> Endpoints may vary slightly depending on `routes.js`. Common endpoints:

### Public / AQI
- `GET /api/aqi/current` — Live AQI across wards/stations
- `GET /api/aqi/ward/:wardId` — Specific ward AQI (derived)
- `GET /api/aqi/station/:id` — Specific station AQI (if enabled)
- `GET /api/aqi/zones` — Zone-aggregated AQI (if enabled)

### Weather
- `GET /api/weather/current` — Current weather conditions
- `GET /api/weather/corridor` — Wind corridor analysis (if enabled)
- `GET /api/weather/forecast` — 3-day forecast (if enabled)
- `GET /api/forecast/72hr` — 72-hour forecast (if implemented)

### Satellite
- `GET /api/satellite/parali` — Parali smoke/fire data from NASA FIRMS
- `GET /api/satellite/trend` — Fire trend (e.g., 7-day), if enabled

### Complaints (if enabled)
- `GET /api/complaints` — List complaints
- `POST /api/complaints` — Submit complaint
- `PATCH /api/complaints/:id/status` — Update complaint status

### Governance / Actions (authenticated if enabled)
- `POST /api/actions` — Log governance/enforcement action
- `GET /api/actions` — List actions
- `GET /api/governance/stats` — Governance statistics (if enabled)
- `GET /api/reports` — Downloadable reports (if enabled)

---

## ☁️ Deployment

### Recommended: Render / Railway

**Render**
1. Create a new Web Service
2. Connect GitHub repository
3. Set root directory to `backend`
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables in Render dashboard

**Railway**
1. Create project from GitHub
2. Set root directory to `backend`
3. Add environment variables
4. Deploy

### Fly.io (Optional)
1. Install `flyctl`
2. Run in `backend/`:
   ```bash
   fly launch
   fly secrets set NASA_FIRMS_MAP_KEY=xxx WEATHER_API_KEY=xxx
   fly deploy
   ```

---

## 🔐 Authentication & Roles

### Citizen
- View AQI & map
- Submit complaints
- Set alerts (if enabled)

### Ward Officer
- All citizen features
- Ward analytics
- Response management

### Admin / MCD
- All features
- System configuration
- Policy simulation (if enabled)
- Action center / enforcement logs

---

## ✅ Real Data Guarantee

- ✅ No demo data
- ✅ No mock values
- ✅ Real API integrations only
- ✅ Actual Delhi ward boundaries (`wards.json`)
- ✅ Real station metadata (`stations.json`)

---

## 🛡 Compliance & Legal

- **Data Privacy**: No PII stored without consent
- **API Security**: Keys via environment variables only
- **Transparency**: Methodology documented (see Ward-Level AQI Computation)
- **Attribution**: All data sources should be cited in UI/About section

---

## ⚠️ Disclaimer

> **All data displayed on this platform is sourced from official public APIs and/or trusted aggregators. No simulated or fake data is used by default.**

1. **Data Accuracy**: Station feeds may have delays, gaps, or outages depending on upstream availability and rate limits.
2. **Fire Detection**: FIRMS detections are observational satellite signals, not legal confirmation. “Parali” labeling is indicative/probabilistic.
3. **Ward AQI**: Derived using spatial interpolation; may differ from any single monitoring station reading.
4. **Policy Simulator**: If included, models may be simplified and should not be used for final policy decisions without expert review.
5. **Health Advisories**: General guidance only; consult healthcare professionals for medical advice.

---

## 🙏 Acknowledgments

- **Central Pollution Control Board (CPCB)** — AQI standards and methodology
- **OpenAQ** — Open air quality data platform
- **NASA FIRMS** — Satellite fire detection system
- **WeatherAPI.com** — Weather data provider
- **OpenStreetMap** — Map tiles

---

## 🔗 Official Sources

- CPCB: https://cpcb.nic.in/
- data.gov.in: https://data.gov.in/
- OpenAQ: https://openaq.org/
- NASA FIRMS: https://firms.modaps.eosdis.nasa.gov/
- Copernicus Sentinel: https://sentinel.esa.int/
- WeatherAPI: https://www.weatherapi.com/

---

## 📞 Support

If you face issues:
1. Check `.env` keys and restart the backend
2. Verify internet connectivity
3. Review backend logs for upstream API errors/rate limits
4. Ensure Node.js 18+ is installed

---

**Version**: 1.0.0  
**Status**: Production Ready  
**License**: Open for Government Use  

*Built for Hack4Delhi — Civic Tech for Cleaner Air*