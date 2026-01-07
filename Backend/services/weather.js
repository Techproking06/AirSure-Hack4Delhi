const axios = require("axios");

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchWeather(lat, lon) {
  const key = process.env.WEATHER_API_KEY;

  if (!key || key === "YOUR_KEY_HERE") {
    throw new Error("Weather API key missing. Set WEATHER_API_KEY in .env");
  }

  const latNum = toNumber(lat);
  const lonNum = toNumber(lon);

  if (latNum === null || lonNum === null) {
    throw new Error("Invalid lat/lon. Provide numeric lat and lon values.");
  }

  const url = "https://api.weatherapi.com/v1/current.json";

  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      params: {
        key,
        q: `${latNum},${lonNum}`,
        aqi: "no",
      },
      headers: {
        Accept: "application/json",
      },
    });

    return {
      source: "weatherapi",
      location: data.location?.name ?? null,
      region: data.location?.region ?? null,
      country: data.location?.country ?? null,
      lat: data.location?.lat ?? latNum,
      lon: data.location?.lon ?? lonNum,

      temp_c: data.current?.temp_c ?? null,
      feelslike_c: data.current?.feelslike_c ?? null,
      humidity: data.current?.humidity ?? null,

      wind_kph: data.current?.wind_kph ?? null,
      wind_degree: data.current?.wind_degree ?? null,
      wind_dir: data.current?.wind_dir ?? null,

      condition: data.current?.condition?.text ?? null,
      condition_icon: data.current?.condition?.icon ?? null,

      updatedAt: data.current?.last_updated ?? null,
      raw: data ?? null,
    };
  } catch (err) {
    const status = err?.response?.status;
    const apiMsg =
      err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      null;

    const msg = apiMsg || err.message || "Failed to fetch weather";

    // Throw a clean error up to routes.js (it already returns 500 nicely)
    throw new Error(status ? `Weather API error ${status}: ${msg}` : msg);
  }
}

module.exports = { fetchWeather };