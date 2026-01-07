// Frontend/script.js
const API_BASE = "/api";

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });

  let body = null;
  try {
    body = await res.json();
  } catch (_) {}

  if (!res.ok) {
    const msg = body?.error || body?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

function setText(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text;
  return !!el;
}

let lastHydrateAt = 0;
let lastSuccessAt = 0;

async function hydrateIfPossible() {
  const now = Date.now();

  // Only hydrate when the home snapshot placeholders exist
  const hasHomeTargets =
    document.querySelector(".home-aqi-value") ||
    document.querySelector(".home-wind") ||
    document.querySelector(".home-temp");

  if (!hasHomeTargets) return;

  // After a successful hydration, don't refetch for 60s
  if (lastSuccessAt && now - lastSuccessAt < 60000) return;

  // Throttle so we don’t spam requests during rendering
  if (now - lastHydrateAt < 800) return;
  lastHydrateAt = now;

  try {
    const [aqiRes, weather] = await Promise.all([
      apiGet("/aqi/aggregate"),
      apiGet("/weather"),
    ]);

    const aqiVal = aqiRes?.aggregated?.aqi ?? null;
    const aqiCat = aqiRes?.aggregated?.category ?? "Unknown";

    setText(".home-aqi-value", Number.isFinite(aqiVal) ? `${aqiVal}` : "N/A");
    setText(".home-aqi-cat", aqiCat);

    // Helpful for debugging if AQI is missing
    if (!Number.isFinite(aqiVal) && Array.isArray(aqiRes?.diagnostics)) {
      console.warn("AQI diagnostics:", aqiRes.diagnostics);
    }

    const windKph = weather?.wind_kph;
    setText(
      ".home-wind",
      Number.isFinite(windKph) ? `${windKph} kph ${weather?.wind_dir || ""}` : "N/A"
    );

    const tempC = weather?.temp_c;
    setText(".home-temp", Number.isFinite(tempC) ? `${tempC}°C` : "N/A");

    // Mark success (even if AQI is N/A, we successfully contacted backend)
    lastSuccessAt = Date.now();
  } catch (err) {
    setText(".home-aqi-value", "ERR");
    setText(".home-wind", "ERR");
    console.error("Hydration error:", err.message);
  }
}

function initAirsureHydration() {
  hydrateIfPossible();

  // Watch #app and re-hydrate after it updates.
  const appRoot = document.getElementById("app") || document.body;

  const observer = new MutationObserver(() => {
    hydrateIfPossible();
  });

  observer.observe(appRoot, { childList: true, subtree: true });
}

document.addEventListener("DOMContentLoaded", initAirsureHydration);