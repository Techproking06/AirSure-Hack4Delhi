const axios = require("axios");

const OPENAQ_BASE = (process.env.OPENAQ_BASE || "https://api.openaq.org/v3").replace(/\/$/, "");
const OPENAQ_TIMEOUT = Number(process.env.OPENAQ_TIMEOUT_MS || 12000);

const SERVICE_VERSION = "aqi-v3-latest-sensor-map-v2";

// Caches to avoid 429
const LATEST_TTL_MS = Number(process.env.OPENAQ_LATEST_CACHE_MS || 60000); // 60s
const SENSOR_TTL_MS = Number(process.env.OPENAQ_SENSOR_CACHE_MS || 7 * 24 * 60 * 60 * 1000); // 7d
const PARAM_TTL_MS = Number(process.env.OPENAQ_PARAM_CACHE_MS || 30 * 24 * 60 * 60 * 1000); // 30d

const latestCache = new Map(); // locationId -> { ts, payload }
const sensorCache = new Map(); // sensorId -> { ts, payload }  payload = { parameter: "pm25" | ... | null }
const paramCache = new Map(); // parameterId -> { ts, payload } payload = { parameter: "pm25" | ... | null }

const AQI_BREAKPOINTS = {
  pm25: [
    { cLow: 0, cHigh: 30, iLow: 0, iHigh: 50, category: "Good" },
    { cLow: 31, cHigh: 60, iLow: 51, iHigh: 100, category: "Satisfactory" },
    { cLow: 61, cHigh: 90, iLow: 101, iHigh: 200, category: "Moderate" },
    { cLow: 91, cHigh: 120, iLow: 201, iHigh: 300, category: "Poor" },
    { cLow: 121, cHigh: 250, iLow: 301, iHigh: 400, category: "Very Poor" },
    { cLow: 251, cHigh: 500, iLow: 401, iHigh: 500, category: "Severe" },
  ],
  pm10: [
    { cLow: 0, cHigh: 50, iLow: 0, iHigh: 50, category: "Good" },
    { cLow: 51, cHigh: 100, iLow: 51, iHigh: 100, category: "Satisfactory" },
    { cLow: 101, cHigh: 250, iLow: 101, iHigh: 200, category: "Moderate" },
    { cLow: 251, cHigh: 350, iLow: 201, iHigh: 300, category: "Poor" },
    { cLow: 351, cHigh: 430, iLow: 301, iHigh: 400, category: "Very Poor" },
    { cLow: 431, cHigh: 999, iLow: 401, iHigh: 500, category: "Severe" },
  ],
};

function linearScale(conc, bp) {
  const { cLow, cHigh, iLow, iHigh } = bp;
  return ((iHigh - iLow) / (cHigh - cLow)) * (conc - cLow) + iLow;
}

function normalizeParam(p) {
  // "PM2.5" / "pm2_5" / "pm-2.5" -> "pm25"
  return String(p || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function computeSubIndex(parameter, value) {
  const p = normalizeParam(parameter);
  const breakpoints = AQI_BREAKPOINTS[p];
  const v = Number(value);
  if (!breakpoints || !Number.isFinite(v)) return null;

  const bp =
    breakpoints.find((b) => v >= b.cLow && v <= b.cHigh) ||
    breakpoints[breakpoints.length - 1];

  const idx = Math.round(linearScale(v, bp));
  return { index: Math.min(idx, 500), category: bp.category };
}

function aggregateAQI(measurements) {
  const subIndexes = (Array.isArray(measurements) ? measurements : [])
    .map((m) => {
      const sub = computeSubIndex(m.parameter, m.value);
      if (!sub) return null;
      return { parameter: normalizeParam(m.parameter), ...sub };
    })
    .filter(Boolean);

  if (!subIndexes.length) {
    return { aqi: null, category: "Unknown", dominant: null, subIndexes: [] };
  }

  const dominant = subIndexes.reduce(
    (max, curr) => (curr.index > max.index ? curr : max),
    subIndexes[0]
  );

  return {
    aqi: dominant.index,
    category: dominant.category,
    dominant: dominant.parameter,
    subIndexes,
  };
}

function openaqClient() {
  const apiKey = process.env.OPENAQ_API_KEY;
  const headers = { Accept: "application/json" };

  if (apiKey) {
    headers["X-API-Key"] = apiKey;
    headers["x-api-key"] = apiKey;
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  return axios.create({
    baseURL: OPENAQ_BASE,
    timeout: OPENAQ_TIMEOUT,
    headers,
  });
}

function formatAxiosError(err) {
  const status = err?.response?.status;
  const msg =
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    "Request failed";
  return status ? `HTTP ${status}: ${msg}` : msg;
}

function extractArrayFromResponse(data) {
  if (!data) return [];
  if (Array.isArray(data.results)) return data.results;
  if (data.results && typeof data.results === "object") return Object.values(data.results);
  if (Array.isArray(data.data)) return data.data;
  if (data.data && typeof data.data === "object") return Object.values(data.data);
  if (Array.isArray(data)) return data;
  return [];
}

function cacheGet(map, key, ttlMs) {
  const k = String(key);
  const v = map.get(k);
  if (!v) return null;
  if (Date.now() - v.ts > ttlMs) return null;
  return v.payload;
}

function cacheSet(map, key, payload) {
  map.set(String(key), { ts: Date.now(), payload });
}

function firstDefined(...vals) {
  for (const v of vals) if (v !== undefined && v !== null) return v;
  return undefined;
}

function extractParamFromParamObject(paramObj) {
  if (!paramObj) return null;

  if (typeof paramObj === "string") {
    const p = normalizeParam(paramObj);
    return p || null;
  }

  if (typeof paramObj === "number") return null;

  if (typeof paramObj === "object") {
    const raw = firstDefined(
      paramObj?.name,
      paramObj?.code,
      paramObj?.parameter,
      paramObj?.displayName,
      paramObj?.display_name
    );
    const p = normalizeParam(raw);
    return p || null;
  }

  return null;
}

async function fetchParameterById(client, paramId) {
  const cached = cacheGet(paramCache, paramId, PARAM_TTL_MS);
  if (cached) return cached.parameter;

  const paths = [`/parameters/${paramId}`, `/parameter/${paramId}`];

  for (const p of paths) {
    try {
      const resp = await client.get(p);
      const arr = extractArrayFromResponse(resp.data);
      const obj = arr[0] || resp.data;

      const raw = firstDefined(
        obj?.name,
        obj?.code,
        obj?.parameter,
        obj?.displayName,
        obj?.display_name
      );
      const param = normalizeParam(raw) || null;

      cacheSet(paramCache, paramId, { parameter: param });
      return param;
    } catch {
      // try next
    }
  }

  try {
    const resp = await client.get("/parameters", {
      params: { id: String(paramId), limit: 1, page: 1 },
    });
    const arr = extractArrayFromResponse(resp.data);
    const obj = arr[0] || null;

    const raw = obj ? firstDefined(obj?.name, obj?.code, obj?.parameter) : null;
    const param = normalizeParam(raw) || null;

    cacheSet(paramCache, paramId, { parameter: param });
    return param;
  } catch {
    cacheSet(paramCache, paramId, { parameter: null });
    return null;
  }
}

async function extractSensorParam(client, sensorObj) {
  const nested = extractParamFromParamObject(sensorObj?.parameter);
  if (nested) return nested;

  const direct = normalizeParam(firstDefined(sensorObj?.parameter_name, sensorObj?.parameterName));
  if (direct) return direct;

  const paramId = Number(
    firstDefined(
      sensorObj?.parameterId,
      sensorObj?.parameter_id,
      sensorObj?.parameter?.id,
      sensorObj?.parameter?.parameterId,
      sensorObj?.parameter?.parameter_id,
      sensorObj?.parametersId,
      sensorObj?.parameters_id
    )
  );

  if (Number.isFinite(paramId)) {
    const p = await fetchParameterById(client, paramId);
    return p || null;
  }

  return null;
}

async function fetchSensorsBatchIfSupported(client, sensorIds) {
  try {
    const resp = await client.get("/sensors", {
      params: {
        ids: sensorIds.join(","),
        limit: sensorIds.length,
        page: 1,
      },
    });
    const arr = extractArrayFromResponse(resp.data);
    return arr.length ? arr : null;
  } catch {
    return null;
  }
}

async function fetchSensorIndividually(client, sensorId) {
  const paths = [`/sensors/${sensorId}`, `/sensor/${sensorId}`];

  for (const p of paths) {
    try {
      const resp = await client.get(p);
      const arr = extractArrayFromResponse(resp.data);
      return arr[0] || resp.data || null;
    } catch {
      // try next
    }
  }

  try {
    const resp = await client.get("/sensors", {
      params: { id: String(sensorId), limit: 1, page: 1 },
    });
    const arr = extractArrayFromResponse(resp.data);
    return arr[0] || null;
  } catch {
    return null;
  }
}

async function buildSensorIdToParamMap(client, sensorIds) {
  const idToParam = new Map();
  const toFetch = [];

  for (const id of sensorIds) {
    const cached = cacheGet(sensorCache, id, SENSOR_TTL_MS);
    if (cached && "parameter" in cached) {
      if (cached.parameter) idToParam.set(id, cached.parameter);
      continue;
    }
    toFetch.push(id);
  }

  // Try batch first
  const batched = toFetch.length ? await fetchSensorsBatchIfSupported(client, toFetch) : null;
  if (batched) {
    for (const s of batched) {
      const id = Number(s?.id ?? s?.sensorsId ?? s?.sensorId);
      if (!Number.isFinite(id)) continue;

      const param = await extractSensorParam(client, s);
      if (param) {
        idToParam.set(id, param);
        cacheSet(sensorCache, id, { parameter: param });
      } else {
        cacheSet(sensorCache, id, { parameter: null });
      }
    }
  }

  // Fallback: individual for any still missing
  for (const id of toFetch) {
    if (idToParam.has(id)) continue;

    const sObj = await fetchSensorIndividually(client, id);
    const param = sObj ? await extractSensorParam(client, sObj) : null;

    if (param) {
      idToParam.set(id, param);
      cacheSet(sensorCache, id, { parameter: param });
    } else {
      cacheSet(sensorCache, id, { parameter: null });
    }
  }

  return idToParam;
}

async function fetchLatestByLocationId(client, locationId) {
  const cached = cacheGet(latestCache, locationId, LATEST_TTL_MS);
  if (cached) return { data: cached, cacheHit: true };

  const resp = await client.get(`/locations/${locationId}/latest`);
  cacheSet(latestCache, locationId, resp.data);
  return { data: resp.data, cacheHit: false };
}

async function fetchOpenAQLatest(station) {
  try {
    if (!process.env.OPENAQ_API_KEY) {
      return {
        version: SERVICE_VERSION,
        station: station?.id ?? station?.name ?? null,
        locationId: null,
        availableParameters: [],
        measurements: [],
        aggregated: aggregateAQI([]),
        debug: { note: "Missing OPENAQ_API_KEY" },
        source: "openaq_v3",
        error: "Missing OPENAQ_API_KEY in Backend/.env (required for OpenAQ v3).",
      };
    }

    const locationId = Number(station?.locationId);
    if (!Number.isFinite(locationId)) {
      return {
        version: SERVICE_VERSION,
        station: station?.id ?? station?.name ?? null,
        locationId: null,
        availableParameters: [],
        measurements: [],
        aggregated: aggregateAQI([]),
        debug: { note: "No numeric station.locationId" },
        source: "openaq_v3",
        error: "Missing numeric locationId in stations.json.",
      };
    }

    const client = openaqClient();
    const { data, cacheHit } = await fetchLatestByLocationId(client, locationId);

    const rows = extractArrayFromResponse(data);

    const sensorIds = Array.from(
      new Set(
        rows
          .map((r) => Number(r?.sensorsId ?? r?.sensorId ?? r?.sensor_id))
          .filter((n) => Number.isFinite(n))
      )
    );

    const idToParam = await buildSensorIdToParamMap(client, sensorIds);

    const parsed = rows
      .map((r) => {
        const sid = Number(r?.sensorsId ?? r?.sensorId ?? r?.sensor_id);
        const param = idToParam.get(sid) || null;
        const value = Number(r?.value);

        if (!param) return null;
        if (!Number.isFinite(value)) return null;

        return {
          parameter: normalizeParam(param),
          value,
          lastUpdated: r?.datetime?.utc || r?.datetime || null,
        };
      })
      .filter(Boolean);

    const availableParameters = Array.from(new Set(parsed.map((m) => m.parameter))).sort();
    const measurements = parsed.filter((m) => m.parameter === "pm25" || m.parameter === "pm10");

    return {
      version: SERVICE_VERSION,
      station: station?.id ?? station?.name ?? locationId,
      locationId,
      availableParameters,
      measurements,
      aggregated: aggregateAQI(measurements),
      debug: {
        cacheHit,
        latestRows: rows.length,
        uniqueSensors: sensorIds.length,
        mappedSensors: Array.from(idToParam.values()).filter(Boolean).length,
        parsedCount: parsed.length,
        pmCount: measurements.length,
        sensorMapPreview: Array.from(idToParam.entries()).slice(0, 10),
      },
      source: "openaq_v3",
      error: null,
    };
  } catch (err) {
    return {
      version: SERVICE_VERSION,
      station: station?.id ?? station?.name ?? null,
      locationId: Number(station?.locationId) || null,
      availableParameters: [],
      measurements: [],
      aggregated: aggregateAQI([]),
      debug: { note: "request failed" },
      source: "openaq_v3",
      error: `OpenAQ latest failed: ${formatAxiosError(err)}`,
    };
  }
}

module.exports = {
  computeSubIndex,
  aggregateAQI,
  fetchOpenAQLatest,
};