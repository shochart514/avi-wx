// weather-server.mjs — ESM server on port 5055, CYJN→CWIZ alias
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 5055;

app.use(cors());

// Clean ICAO
function cleanStation(station) {
  if (!station) return null;
  const s = station.toUpperCase().trim();
  if (!/^[A-Z0-9]{3,4}$/.test(s)) return null;
  return s;
}

// Fetch wrapper with User-Agent
async function fetchWithUA(url) {
  return fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (SkynovaLobby/1.0)",
      Accept: "*/*",
    },
  });
}

// -----------------------------
// METAR / LWIS  (CYJN -> CWIZ alias)
// -----------------------------
app.get("/metar", async (req, res) => {
  try {
    const station = cleanStation(req.query.station);
    if (!station) {
      return res.status(400).json({ error: "Invalid station" });
    }

    // CYJN has no METAR -> use CWIZ (L’Acadie) as surrogate
    const upstreamStation = station === "CYJN" ? "CWIZ" : station;

    const url = `https://tgftp.nws.noaa.gov/data/observations/metar/stations/${upstreamStation}.TXT`;
    const resp = await fetchWithUA(url);

    if (!resp.ok) {
      console.error(
        `Upstream METAR error for ${upstreamStation}:`,
        resp.status,
        resp.statusText
      );
      return res.json({
        raw_text: `METAR/LWIS indisponible (code ${resp.status}) pour ${station}`,
        observation_time: null,
      });
    }

    const text = await resp.text();
    const lines = text.trim().split("\n");

    const observation_time = lines[0] || null;
    const raw_text = lines.slice(1).join(" ").trim() || null;

    return res.json({ raw_text, observation_time });
  } catch (err) {
    console.error("METAR error:", err);
    return res.json({
      raw_text: "METAR/LWIS indisponible (erreur serveur)",
      observation_time: null,
    });
  }
});

// -----------------------------
// TAF
// -----------------------------
app.get("/taf", async (req, res) => {
  try {
    const station = cleanStation(req.query.station);
    if (!station) {
      return res.status(400).json({ error: "Invalid station" });
    }

    const url = `https://tgftp.nws.noaa.gov/data/forecasts/taf/stations/${station}.TXT`;
    const resp = await fetchWithUA(url);

    if (resp.status === 404) {
      return res.json({
        raw_text: `TAF non disponible pour ${station}`,
        issue_time: null,
      });
    }

    if (!resp.ok) {
      console.error(
        `Upstream TAF error for ${station}:`,
        resp.status,
        resp.statusText
      );
      return res.json({
        raw_text: `TAF indisponible (code ${resp.status}) pour ${station}`,
        issue_time: null,
      });
    }

    const text = await resp.text();
    return res.json({ raw_text: text.trim(), issue_time: null });
  } catch (err) {
    console.error("TAF error:", err);
    return res.json({
      raw_text: "TAF indisponible (erreur serveur)",
      issue_time: null,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Weather proxy running at http://localhost:${PORT}`);
});
