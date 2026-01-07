const axios = require("axios");

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchFirmsFires() {
  const key = process.env.NASA_FIRMS_MAP_KEY;

  if (!key || key === "YOUR_KEY_HERE") {
    throw new Error("NASA FIRMS key missing. Set NASA_FIRMS_MAP_KEY in .env");
  }

  // Set this in .env if you want:
  // NASA_FIRMS_AREA=Delhi  (or India, Punjab, etc. depending on FIRMS accepted names)
  const area = process.env.NASA_FIRMS_AREA || "Delhi";

  // Product choices (examples): VIIRS_SNPP_NRT, VIIRS_NOAA20_NRT, MODIS_NRT
  const product = process.env.NASA_FIRMS_PRODUCT || "VIIRS_SNPP_NRT";

  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/json/${key}/${product}/${encodeURIComponent(
    area
  )}`;

  try {
    const { data } = await axios.get(url, {
      timeout: 12000,
      headers: { Accept: "application/json" },
    });

    // FIRMS sometimes returns an array of points, sometimes GeoJSON-like
    const points = Array.isArray(data)
      ? data
      : Array.isArray(data?.features)
      ? data.features.map((f) => f.properties || {})
      : [];

    return points
      .map((p) => {
        const lat = toNumber(p.latitude ?? p.lat ?? p.LATITUDE);
        const lon = toNumber(p.longitude ?? p.lon ?? p.LONGITUDE);

        if (lat === null || lon === null) return null;

        return {
          lat,
          lon,
          bright_ti4: toNumber(p.bright_ti4 ?? p.BRIGHT_TI4 ?? p.bright_ti5) ?? null,
          acq_date: p.acq_date ?? p.ACQ_DATE ?? null,
          acq_time: p.acq_time ?? p.ACQ_TIME ?? null,
          satellite: p.satellite ?? p.SATELLITE ?? null,
          confidence: p.confidence ?? p.CONFIDENCE ?? null,
          source: "nasa_firms",
        };
      })
      .filter(Boolean);
  } catch (err) {
    const status = err?.response?.status;
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "Failed to fetch FIRMS fires";

    throw new Error(status ? `FIRMS error ${status}: ${msg}` : msg);
  }
}

module.exports = { fetchFirmsFires };