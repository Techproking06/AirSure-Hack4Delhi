const express = require("express");
const { fetchOpenAQLatest } = require("./services/aqi");
const { fetchWeather } = require("./services/weather");
const { fetchFirmsFires } = require("./services/satellite");
const stations = require("./data/stations.json");
const wards = require("./data/wards.json");

const router = express.Router();

const ROUTES_VERSION = "routes-seq-aggregate-v2";

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "AirSure API",
    version: ROUTES_VERSION,
    time: new Date().toISOString(),
  });
});

router.get("/stations", (_req, res) => {
  res.json({ count: stations.length, data: stations });
});

router.get("/wards", (_req, res) => {
  res.json({ count: wards.length, data: wards });
});

router.get("/aqi/latest", async (req, res) => {
  try {
    if (!Array.isArray(stations) || stations.length === 0) {
      return res.status(400).json({ error: "No stations found in stations.json" });
    }

    // Optional: allow selecting a station using ?id=
    const requestedId = String(req.query.id || "").trim().toLowerCase();
    const chosen =
      requestedId
        ? stations.find((s) => String(s?.id || "").trim().toLowerCase() === requestedId) ||
          stations[0]
        : stations[0];

    const result = await fetchOpenAQLatest(chosen);

    res.json({
      version: ROUTES_VERSION,
      stationMeta: chosen,
      ...result,
    });
  } catch (err) {
    console.error("AQI latest failed:", err?.response?.data || err);
    res.status(500).json({
      error: "Failed to fetch AQI",
      details: err?.message || String(err),
    });
  }
});

// Optional debugging endpoint (station-by-station)
router.get("/aqi/stations", async (_req, res) => {
  try {
    if (!Array.isArray(stations) || stations.length === 0) {
      return res.status(400).json({ error: "No stations found in stations.json" });
    }

    // Sequential to avoid burst traffic
    const results = [];
    for (const s of stations) {
      const r = await fetchOpenAQLatest(s);
      results.push({ stationMeta: s, ...r });
    }

    res.json({ version: ROUTES_VERSION, count: results.length, data: results });
  } catch (err) {
    console.error("AQI stations failed:", err?.response?.data || err);
    res.status(500).json({
      error: "Failed to fetch station AQI",
      details: err?.message || String(err),
    });
  }
});

// Citywide aggregate across stations (dominant = highest station AQI)
// Sequential fetch to reduce burst traffic and avoid 429s.
router.get("/aqi/aggregate", async (_req, res) => {
  try {
    if (!Array.isArray(stations) || stations.length === 0) {
      return res.status(400).json({ error: "No stations found in stations.json" });
    }

    const results = [];
    for (const s of stations) {
      results.push(await fetchOpenAQLatest(s));
    }

    const diagnostics = results.map((r, i) => ({
      id: stations[i]?.id ?? null,
      name: stations[i]?.name ?? null,
      locationId: r?.locationId ?? null,
      aqi: r?.aggregated?.aqi ?? null,
      dominant: r?.aggregated?.dominant ?? null,
      measurementsCount: Array.isArray(r?.measurements) ? r.measurements.length : 0,
      availableParameters: r?.availableParameters ?? [],
      debug: r?.debug ?? null,
      error: r?.error ?? null,
      source: r?.source ?? null,
      serviceVersion: r?.version ?? null,
    }));

    const valid = results
      .map((r, idx) => ({ idx, aqi: r?.aggregated?.aqi }))
      .filter((x) => Number.isFinite(x.aqi));

    if (valid.length === 0) {
      return res.json({
        version: ROUTES_VERSION,
        aggregated: { aqi: null, category: "Unknown", dominant: null, subIndexes: [] },
        count: results.length,
        note:
          "No station returned a numeric AQI. Check diagnostics[].error and diagnostics[].availableParameters (need pm25/pm10).",
        diagnostics,
      });
    }

    valid.sort((a, b) => b.aqi - a.aqi);
    const top = valid[0];

    res.json({
      version: ROUTES_VERSION,
      aggregated: results[top.idx].aggregated,
      dominantStation: stations[top.idx],
      count: results.length,
      diagnostics,
    });
  } catch (err) {
    console.error("AQI aggregate failed:", err?.response?.data || err);
    res.status(500).json({
      error: "Failed to aggregate AQI",
      details: err?.message || String(err),
    });
  }
});

router.get("/weather", async (req, res) => {
  const lat = toNumber(req.query.lat, 28.6139);
  const lon = toNumber(req.query.lon, 77.209);

  try {
    const weather = await fetchWeather(lat, lon);
    res.json(weather);
  } catch (err) {
    console.error("Weather failed:", err?.response?.data || err);
    res.status(500).json({
      error: "Failed to fetch weather",
      details: err?.message || String(err),
    });
  }
});

router.get("/satellite/fires", async (_req, res) => {
  try {
    const fires = await fetchFirmsFires();
    res.json({ count: fires.length, data: fires });
  } catch (err) {
    console.error("FIRMS fires failed:", err?.response?.data || err);
    res.status(500).json({
      error: "Failed to fetch FIRMS fires",
      details: err?.message || String(err),
    });
  }
});

module.exports = router;