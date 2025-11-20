import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Cloud,
  Flag,
  Plane,
  RefreshCw,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";

import "./lobby.css";

// -----------------------------
//  ROTATION SETTINGS
// -----------------------------
const LOBBY_STATIONS = ["CYJN", "CYHU", "CYUL", "CYMX"];

// 30 seconds per airport
const STATION_ROTATION_MS = 30000;

// Weather slide => 4 airports = 120 seconds
// Circuits slide => 30 seconds
// Total = 150 seconds loop
const SLIDES = ["weather", "weather", "weather", "weather", "circuits"];
const SLIDE_ROTATION_MS = 30000;

// Circuits app URL
const CIRCUITS_URL = "https://yjn-circuits.netlify.app/?lang=fr";

// Backend base URL (new port)
const WX_BASE =
  import.meta.env.VITE_WX_BASE_URL || "http://localhost:5055";

// -----------------------------
//  METAR PARSING (simple, not perfect)
// -----------------------------
function parseMetar(raw_text, observation_time) {
  if (!raw_text) {
    return { raw_text: "—", observation_time: null, sky_condition: [] };
  }

  const tokens = raw_text.split(/\s+/);
  const result = { raw_text, observation_time, sky_condition: [] };

  const windToken = tokens.find((t) => /KT$/.test(t));
  if (windToken) {
    if (windToken.startsWith("VRB")) {
      result.wind_dir_degrees = null;
    } else {
      const dir = windToken.slice(0, 3);
      const dirNum = parseInt(dir, 10);
      if (!isNaN(dirNum)) result.wind_dir_degrees = dirNum;
    }
    const speedMatch = windToken.match(/(\d{2,3})KT$/);
    if (speedMatch) {
      result.wind_speed_kt = parseInt(speedMatch[1], 10);
    }
  }

  const visToken = tokens.find((t) => /SM$/.test(t));
  if (visToken) {
    const v = visToken.replace("SM", "");
    const vis = parseFloat(v);
    if (!isNaN(vis)) result.visibility_statute_mi = vis;
  }

  const tempToken = tokens.find((t) => t.includes("/") && /\d/.test(t));
  if (tempToken) {
    const [tPart, dPart] = tempToken.split("/");
    const convert = (s) => {
      if (!s) return null;
      if (s.startsWith("M")) return -parseInt(s.slice(1), 10);
      return parseInt(s, 10);
    };
    result.temp_c = convert(tPart);
    result.dewpoint_c = convert(dPart);
  }

  const altToken = tokens.find((t) => /^A\d{4}$/.test(t));
  if (altToken) {
    const inches = parseInt(altToken.slice(1), 10);
    if (!isNaN(inches)) {
      result.altim_in_hg = (inches / 100).toFixed(2);
    }
  }

  tokens.forEach((t) => {
    const m = t.match(/^(FEW|SCT|BKN|OVC)(\d{3})/);
    if (m) {
      result.sky_condition.push({
        sky_cover: m[1],
        cloud_base_ft_agl: parseInt(m[2], 10) * 100,
      });
    }
  });

  return result;
}

// -----------------------------
//  FETCH REAL DATA FROM BACKEND
// -----------------------------
async function getMetar(station) {
  const res = await fetch(
    `${WX_BASE}/metar?station=${encodeURIComponent(station)}`
  );
  if (!res.ok) {
    throw new Error("METAR fetch failed");
  }
  const data = await res.json();
  return parseMetar(data.raw_text, data.observation_time);
}

async function getTaf(station) {
  const res = await fetch(
    `${WX_BASE}/taf?station=${encodeURIComponent(station)}`
  );
  if (!res.ok) {
    throw new Error("TAF fetch failed");
  }
  const data = await res.json();
  return {
    raw_text: data.raw_text || "—",
    issue_time: data.issue_time || null,
  };
}

async function getPireps() {
  const now = new Date().toISOString();
  return [
    {
      receive_time: now,
      raw_text:
        "CYUL UA /OV CYJN 020010 /FL060 /TP C172 /TB MOD /SK BKN060 (données démo)",
    },
  ];
}

// -----------------------------
//  WEATHER SLIDE COMPONENT
// -----------------------------
function WeatherSlide({ station, metar, taf, pireps, loading, obsTime }) {
  return (
    <div className="single-column weather-slide">
      <div className="station-banner">
        <span className="station-banner-label">Aéroport actuel</span>
        <span className="station-banner-code">{station}</span>
      </div>

      <div className="card">
        <div className="card-content">
          <div className="section-header">
            <div className="section-header-left">
              <Plane size={20} />
              <h2 className="section-title">METAR — {station}</h2>
            </div>
            <div style={{ opacity: 0.7, fontSize: 12 }}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </div>
          </div>

          <pre className="code-block">{metar?.raw_text || "—"}</pre>

          <div className="kvp-grid">
            <div className="kvp">
              <Wind size={18} />
              <span className="kvp-value">
                {metar && metar.wind_speed_kt != null
                  ? `${
                      metar.wind_dir_degrees != null
                        ? metar.wind_dir_degrees + "°"
                        : "VRB"
                    } @ ${metar.wind_speed_kt} kt`
                  : "—"}
              </span>
            </div>

            <div className="kvp">
              <Sun size={18} />
              <span className="kvp-value">
                {metar?.visibility_statute_mi != null
                  ? `${metar.visibility_statute_mi} SM`
                  : "—"}
              </span>
            </div>

            <div className="kvp">
              <Thermometer size={18} />
              <span className="kvp-value">
                {metar?.temp_c != null && metar?.dewpoint_c != null
                  ? `${metar.temp_c}°C / ${metar.dewpoint_c}°C`
                  : "—"}
              </span>
            </div>

            <div className="kvp">
              <Flag size={18} />
              <span className="kvp-value">
                {metar?.altim_in_hg ? `${metar.altim_in_hg} inHg` : "—"}
              </span>
            </div>
          </div>

          <div className="kvp-grid" style={{ marginTop: 10 }}>
            {metar?.sky_condition?.map((s, idx) => (
              <div className="kvp" key={idx}>
                <Cloud size={18} />
                <span className="kvp-value">
                  {s.sky_cover} {s.cloud_base_ft_agl} ft
                </span>
              </div>
            ))}
          </div>

          <p style={{ marginTop: 12, opacity: 0.6, fontSize: 12 }}>
            Observation time: {obsTime}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-content">
          <div className="section-header">
            <div className="section-header-left">
              <Flag size={20} />
              <h2 className="section-title">TAF — {station}</h2>
            </div>
          </div>
          <pre className="code-block">{taf?.raw_text || "—"}</pre>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-content">
          <div className="section-header">
            <div className="section-header-left">
              <AlertCircle size={20} />
              <h2 className="section-title">PIREPs — {station} area</h2>
            </div>
          </div>

          <ul className="pirep-list">
            {pireps?.map((p, idx) => (
              <li className="pirep-item" key={idx}>
                <div className="pirep-header">
                  <span>Nearby</span>
                  <span style={{ opacity: 0.7 }}>
                    {new Date(p.receive_time).toLocaleTimeString()}
                  </span>
                </div>
                <div className="pirep-body">{p.raw_text}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// -----------------------------
//  CIRCUITS SLIDE
// -----------------------------
function CircuitsSlide() {
  return (
    <div className="single-column">
      <div className="card">
        <div className="card-content">
          <div className="section-header">
            <h2 className="section-title">Circuits CYJN</h2>
            <span style={{ opacity: 0.7, fontSize: 12 }}>
              yjn-circuits.netlify.app
            </span>
          </div>

          <div className="iframe-wrapper">
            <iframe
              src={CIRCUITS_URL}
              className="iframe-full"
              title="CYJN Circuits"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------
//  MAIN COMPONENT
// -----------------------------
export default function AviWxDashboard() {
  const [station, setStation] = useState(LOBBY_STATIONS[0]);
  const [metar, setMetar] = useState(null);
  const [taf, setTaf] = useState(null);
  const [pireps, setPireps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [slideIndex, setSlideIndex] = useState(0);
  const currentSlide = SLIDES[slideIndex];

  async function loadAll(stn) {
    try {
      setLoading(true);
      setError(null);

      const [m, t, p] = await Promise.all([
        getMetar(stn),
        getTaf(stn),
        getPireps(stn),
      ]);

      setStation(stn);
      setMetar(m);
      setTaf(t);
      setPireps(p);
    } catch (e) {
      console.error(e);
      setError("Erreur lors du chargement des données météo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let i = 0;
    loadAll(LOBBY_STATIONS[i]);

    const id = setInterval(() => {
      i = (i + 1) % LOBBY_STATIONS.length;
      loadAll(LOBBY_STATIONS[i]);
    }, STATION_ROTATION_MS);

    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % SLIDES.length);
    }, SLIDE_ROTATION_MS);

    return () => clearInterval(id);
  }, []);

  const obsTime = useMemo(() => {
    if (!metar?.observation_time) return "--";
    const raw = metar.observation_time;
    const d = new Date(raw.replace(" ", "T") + "Z");
    if (isNaN(d)) return raw;
    return d.toLocaleString();
  }, [metar]);

  return (
    <div className="app-root">
      <div className="app-container">
        <header className="app-header">
          <div className="app-header-main">
            <h1>AviWx Lobby Display</h1>
            <p>
              Aéroports: {LOBBY_STATIONS.join(" • ")} — rotation toutes{" "}
              {STATION_ROTATION_MS / 1000}s
            </p>
            <p style={{ opacity: 0.7, fontSize: 12 }}>
              Vue actuelle:{" "}
              {currentSlide === "weather"
                ? "Météo (METAR / TAF / PIREPs)"
                : "Circuits CYJN"}
            </p>
          </div>
        </header>

        {error && (
          <div className="error-box">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {currentSlide === "weather" ? (
          <WeatherSlide
            key={station}
            station={station}
            metar={metar}
            taf={taf}
            pireps={pireps}
            loading={loading}
            obsTime={obsTime}
          />
        ) : (
          <CircuitsSlide />
        )}
      </div>

      <footer className="app-footer">
        Skynova Aviation — Lobby Display (toujours vérifier les sources
        officielles NAV CANADA / AWC)
      </footer>
    </div>
  );
}
