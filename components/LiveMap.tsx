"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONNECTORS, MAP, ROW_Y, STATIONS, STRAIGHTS, stationXY } from "@/lib/line";
import { placeAll, type Placed } from "@/lib/position";
import type { TrainsPayload } from "@/lib/prim";

const POLL_MS = 30_000;
const AUTO_STOP_MS = 15 * 60_000;

const MAX_LOG = 20;
const TOAST_MS = 6_000;
const SHOW_CALLS_KEY = "rer-a:show-calls";

type Filter = "all" | "E" | "W";
type StopReason = "user" | "auto" | "hidden" | null;

/** Un appel à /api/trains et ce qu’il a rapporté. */
interface CallLog {
  n: number;
  at: number;
  ok: boolean;
  httpStatus: number | null;
  durationMs: number;
  error?: string;
  sizeKb?: number;
  /** En-tête x-vercel-cache : HIT, MISS, STALE… (absent en local). */
  cache?: string | null;
  journeys?: number;
  onMap?: number;
  east?: number;
  west?: number;
  late?: number;
  /** Horodatage de la réponse PRIM (ResponseTimestamp SIRI). */
  primAt?: number | null;
  /** Les données PRIM ont-elles changé depuis l’appel réussi précédent ? */
  fresh?: boolean;
}

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
const hhmm = (ms: number) => timeFmt.format(new Date(ms));
const secFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Paris" });
const hhmmss = (ms: number) => secFmt.format(new Date(ms));

function cacheLabel(c: string | null | undefined) {
  if (c === "HIT") return "servi par le cache Vercel";
  if (c === "STALE") return "cache Vercel, rafraîchi en arrière-plan";
  if (c === "MISS") return "calculé par le serveur";
  return null;
}

function summaryLine(c: CallLog) {
  return `${c.onMap} trains sur le plan · ${c.east} vers l’est · ${c.west} vers l’ouest · ${c.late} en retard`;
}

function metaLine(c: CallLog) {
  const parts: string[] = [];
  if (c.primAt) {
    const ageMin = Math.floor((c.at - c.primAt) / 60_000);
    const tag = ageMin >= 2 ? `anciennes, il y a ${ageMin} min` : c.fresh ? "nouvelles" : "inchangées";
    parts.push(`Données PRIM de ${hhmmss(c.primAt)} (${tag})`);
  }
  parts.push(`${c.journeys} courses reçues`);
  const cache = cacheLabel(c.cache);
  if (cache) parts.push(cache);
  parts.push(`${c.durationMs} ms`, `${c.sizeKb} Ko`);
  return parts.join(" · ");
}
const stName = (code: string | null) => (code ? STATIONS[code].name : "");

function inLabel(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return "moins d’1 min";
  return `dans ${Math.round(s / 60)} min`;
}

function whereLabel(p: Placed) {
  if (p.state === "waiting") return `Départ imminent · ${stName(p.fromCode)}`;
  if (p.state === "atStop") return `À quai · ${stName(p.fromCode)}`;
  return `Entre ${stName(p.fromCode)} et ${stName(p.toCode)}`;
}

/* ---------- Plan statique ---------- */

function Tracks() {
  const T = MAP.track;
  const h = T / 2;
  const R = 14;
  const solid = `${T}px solid var(--line)`;
  const pieces: React.CSSProperties[] = [];

  for (const [c1, c2, row] of STRAIGHTS) {
    const y = ROW_Y[row];
    const x1 = MAP.x0 + c1 * MAP.step;
    const x2 = MAP.x0 + c2 * MAP.step;
    pieces.push({ left: x1, top: y - h, width: x2 - x1, height: T, background: "var(--line)" });
  }
  for (const [a, b] of CONNECTORS) {
    const A = stationXY(a);
    const B = stationXY(b);
    const xm = (A.x + B.x) / 2;
    const ym = (A.y + B.y) / 2;
    if (B.y > A.y) {
      pieces.push({ left: A.x, top: A.y - h, width: xm + h - A.x, height: ym - (A.y - h), borderTop: solid, borderRight: solid, borderTopRightRadius: R });
      pieces.push({ left: xm - h, top: ym, width: B.x - (xm - h), height: B.y + h - ym, borderLeft: solid, borderBottom: solid, borderBottomLeftRadius: R });
    } else {
      pieces.push({ left: A.x, top: ym, width: xm + h - A.x, height: A.y + h - ym, borderBottom: solid, borderRight: solid, borderBottomRightRadius: R });
      pieces.push({ left: xm - h, top: B.y - h, width: B.x - (xm - h), height: ym - (B.y - h), borderTop: solid, borderLeft: solid, borderTopLeftRadius: R });
    }
  }
  return (
    <>
      {pieces.map((style, i) => (
        <div key={i} className="track" style={style} aria-hidden="true" />
      ))}
    </>
  );
}

function Stations() {
  return (
    <>
      {Object.entries(STATIONS).map(([code, s]) => {
        const { x, y } = stationXY(code);
        const above = s.row === "mid";
        return (
          <div key={code}>
            <div className="station-dot" style={{ left: x - 6, top: y - 6 }} aria-hidden="true" />
            <span
              className={`station-label${s.terminus ? " terminus" : ""}`}
              style={{
                left: x + 4,
                top: above ? y - 42 : y + 28,
                transformOrigin: above ? "left bottom" : "left top",
                transform: `rotate(${above ? -40 : 40}deg)`,
              }}
            >
              {s.name}
            </span>
          </div>
        );
      })}
    </>
  );
}

/* ---------- Composant principal ---------- */

export default function LiveMap() {
  const [running, setRunning] = useState(false);
  const [stopReason, setStopReason] = useState<StopReason>(null);
  const [data, setData] = useState<TrainsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [calls, setCalls] = useState<CallLog[]>([]);
  const [toast, setToast] = useState<CallLog | null>(null);
  const [showCalls, setShowCalls] = useState(true);
  const startedAt = useRef(0);
  const callCount = useRef(0);
  const lastPrimAt = useRef<number | null>(null);

  // Préférence mémorisée dans le navigateur (facultatif : tout marche sans).
  useEffect(() => {
    try {
      if (localStorage.getItem(SHOW_CALLS_KEY) === "0") setShowCalls(false);
    } catch {}
  }, []);
  const toggleShowCalls = (v: boolean) => {
    setShowCalls(v);
    if (!v) setToast(null);
    try {
      localStorage.setItem(SHOW_CALLS_KEY, v ? "1" : "0");
    } catch {}
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    const n = ++callCount.current;
    const t0 = performance.now();
    let log: CallLog;
    let httpStatus: number | null = null;
    try {
      const res = await fetch("/api/trains", { cache: "no-store" });
      httpStatus = res.status;
      const text = await res.text();
      const durationMs = Math.round(performance.now() - t0);
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {}
      if (!res.ok || !json) throw new Error(json?.error ?? `Erreur HTTP ${res.status}`);
      const payload = json as TrainsPayload;
      const at = Date.now();
      const placedNow = placeAll(payload.trains, at);
      const primAt = payload.responseTimestamp ? Date.parse(payload.responseTimestamp) : null;
      log = {
        n,
        at,
        ok: true,
        httpStatus,
        durationMs,
        sizeKb: Math.round(new TextEncoder().encode(text).length / 1024),
        cache: res.headers.get("x-vercel-cache"),
        journeys: payload.trains.length,
        onMap: placedNow.length,
        east: placedNow.filter((p) => p.dir === "E").length,
        west: placedNow.filter((p) => p.dir === "W").length,
        late: placedNow.filter((p) => p.delayMin >= 2).length,
        primAt,
        fresh: primAt !== lastPrimAt.current,
      };
      lastPrimAt.current = primAt;
      setData(payload);
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Erreur inconnue";
      log = { n, at: Date.now(), ok: false, httpStatus, durationMs: Math.round(performance.now() - t0), error: message };
      setError(message);
    } finally {
      setLoading(false);
    }
    setCalls((prev) => [log, ...prev].slice(0, MAX_LOG));
    setToast(log);
  }, []);

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => {
      setNow(Date.now());
      if (Date.now() - startedAt.current > AUTO_STOP_MS) {
        setRunning(false);
        setStopReason("auto");
      }
    }, 1000);
    const onVisibility = () => {
      if (document.hidden) {
        setRunning(false);
        setStopReason("hidden");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [running, load]);

  const start = () => {
    startedAt.current = Date.now();
    setStopReason(null);
    setRunning(true);
  };
  const stop = () => {
    setRunning(false);
    setStopReason("user");
  };

  const placed = useMemo(() => (data ? placeAll(data.trains, now) : []), [data, now]);
  const shown = placed.filter((p) => filter === "all" || p.dir === filter);
  const rows = [...shown].sort((a, b) => (a.dir === b.dir ? (a.dir === "E" ? b.x - a.x : a.x - b.x) : a.dir === "E" ? -1 : 1));
  const sel = placed.find((p) => p.id === selected) ?? null;
  const nDelayed = placed.filter((p) => p.delayMin >= 2).length;
  const ageS = data ? Math.max(0, Math.round((now - Date.parse(data.fetchedAt)) / 1000)) : 0;

  let statusText = "Suivi arrêté";
  if (running) statusText = loading && !data ? "Chargement…" : `En direct · actualisé il y a ${ageS} s`;
  else if (data) statusText = `En pause · données de ${hhmm(Date.parse(data.fetchedAt))}`;

  let banner: string | null = null;
  if (!running && stopReason === "auto") banner = "Le suivi s’est arrêté automatiquement après 15 minutes pour économiser les requêtes. Relancez-le pour continuer.";
  if (!running && stopReason === "hidden") banner = "Le suivi a été mis en pause car l’onglet n’était plus visible.";
  if (!running && stopReason === "user" && data) banner = "Suivi en pause : les positions ne sont plus mises à jour.";

  return (
    <main className="page">
      <header className="header">
        <div className="brand">
          <div className="badge" aria-hidden="true">A</div>
          <div>
            <h1 className="title">RER A en direct</h1>
            <p className="subtitle">Positions estimées à partir des horaires temps réel</p>
          </div>
        </div>
        <div className="controls">
          {data && (
            <p className="muted" style={{ margin: 0 }}>
              <span className="strong">{placed.length}</span> trains en circulation · <span className="strong">{nDelayed}</span> en retard
            </p>
          )}
          <div className="segmented" role="group" aria-label="Sens de circulation">
            {([["all", "Tous"], ["E", "Vers l’est"], ["W", "Vers l’ouest"]] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {label}
              </button>
            ))}
          </div>
          <label className="switch">
            <input type="checkbox" checked={showCalls} onChange={(e) => toggleShowCalls(e.target.checked)} />
            <span className="switch-track" aria-hidden="true" />
            Afficher les appels API
          </label>
          <p className="status" style={{ margin: 0 }} aria-live="polite">
            <span className={`dot ${running ? "live" : "paused"}`} aria-hidden="true" />
            {statusText}
          </p>
          {running ? (
            <button type="button" className="btn secondary" onClick={stop}>Arrêter le suivi</button>
          ) : (
            <button type="button" className="btn" onClick={start}>{data ? "Reprendre le suivi" : "Lancer le suivi"}</button>
          )}
        </div>
      </header>

      <section className="card" aria-label="Plan de la ligne">
        <div className="card-head">
          <h2 className="card-title">Plan de ligne</h2>
          <ul className="legend">
            <li><span className="chip-e" aria-hidden="true" />Vers Boissy / Marne-la-Vallée</li>
            <li><span className="chip-w" aria-hidden="true" />Vers Saint-Germain / Cergy / Poissy</li>
            <li><span className="dot late" aria-hidden="true" style={{ width: 10, height: 10 }} />En retard</li>
          </ul>
        </div>
        {error && <p className="banner error" role="alert">Impossible de charger les données : {error}</p>}
        {banner && !error && <p className="banner">{banner}</p>}
        <div className="map-scroll">
          <div className="map" style={{ width: MAP.width, height: MAP.height }}>
            <Tracks />
            <Stations />
            {placed.map((p) => {
              const lane = p.dir === "E" ? -17 : 17;
              const dim = filter !== "all" && filter !== p.dir;
              const cls = ["train", p.dir === "E" ? "e" : "w", p.state === "waiting" ? "waiting" : "", dim ? "dim" : "", p.id === selected ? "selected" : ""].join(" ");
              return (
                <button
                  key={p.id}
                  type="button"
                  className={cls}
                  style={{ left: Math.round(p.x - 18), top: Math.round(p.y + lane - 9) }}
                  aria-label={`Train ${p.mission} vers ${p.destName}. ${whereLabel(p)}`}
                  onClick={() => setSelected(p.id)}
                >
                  {p.label}
                  {p.delayMin >= 2 && <span className="late" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          {!data && (
            <div className="start-overlay">
              <div className="start-panel">
                <h2>Suivre les trains en direct</h2>
                <p>Les horaires temps réel sont chargés toutes les 30 secondes tant que le suivi est actif. Il s’arrête tout seul après 15 minutes.</p>
                <button type="button" className="btn" onClick={start} disabled={running}>
                  {running ? "Chargement…" : "Lancer le suivi"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="grid">
        <section className="card detail" aria-label="Train sélectionné">
          {sel ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span className="mission">{sel.mission}</span>
                <span className="muted small">{sel.dir === "E" ? "Vers l’est" : "Vers l’ouest"}</span>
              </div>
              <h2 style={{ margin: "0 0 8px", fontSize: 18, lineHeight: 1.4, fontWeight: 600 }}>
                {sel.originName} → {sel.destName}
              </h2>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <span className={`pill${sel.delayMin >= 2 ? " late" : ""}`}>
                  <span className={`dot ${sel.delayMin >= 2 ? "late" : "live"}`} aria-hidden="true" />
                  {sel.delayMin >= 2 ? `Retard +${sel.delayMin} min` : "À l’heure"}
                </span>
                <span className="muted small">{whereLabel(sel)}</span>
              </div>
              {sel.upcoming.length > 0 ? (
                <>
                  <div className="next-box">
                    <p className="muted small" style={{ margin: "0 0 2px" }}>Prochain arrêt</p>
                    <p style={{ margin: 0, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                      <span className="next-name">{stName(sel.upcoming[0].code)}</span>
                      <span className="tnum" style={{ fontSize: 16, fontWeight: 600 }}>{inLabel(sel.upcoming[0].arr - now)}</span>
                    </p>
                  </div>
                  <h3 className="muted small" style={{ margin: "0 0 4px", fontWeight: 600 }}>Arrêts suivants</h3>
                  <ol className="stops">
                    {sel.upcoming.slice(0, 6).map((c) => {
                      const late = c.aimedArr != null && c.arr - c.aimedArr >= 120_000;
                      return (
                        <li key={c.code + c.arr}>
                          <span>{stName(c.code)}</span>
                          <span className="tnum" style={{ display: "flex", gap: 8 }}>
                            {late && <s className="muted">{hhmm(c.aimedArr!)}</s>}
                            <strong style={{ fontWeight: 600 }}>{hhmm(c.arr)}</strong>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : (
                <p className="next-box muted" style={{ margin: 0 }}>Ce train est arrivé à son terminus.</p>
              )}
            </>
          ) : (
            <>
              <h2 className="card-title" style={{ marginBottom: 8 }}>Aucun train sélectionné</h2>
              <p className="muted" style={{ margin: 0 }}>
                {selected ? "Ce train n’est plus en circulation." : "Cliquez sur un train du plan ou de la liste pour voir ses prochains arrêts."}
              </p>
            </>
          )}
        </section>

        <section className="card list" aria-label="Trains en circulation">
          <div className="card-head">
            <h2 className="card-title">Trains en circulation</h2>
            <span className="muted small">{rows.length} affichés</span>
          </div>
          <div className="rows">
            {rows.length === 0 && <p className="empty">{data ? "Aucun train pour ce filtre." : "Lancez le suivi pour afficher les trains."}</p>}
            {rows.map((p) => (
              <button key={p.id} type="button" className="row" aria-pressed={p.id === selected} onClick={() => setSelected(p.id)}>
                <span className={`tag ${p.dir === "E" ? "e" : "w"}`}>{p.label}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="ellipsis" style={{ fontWeight: 500 }}>{p.destName}</span>
                  <span className="ellipsis muted small">
                    {p.state === "moving" ? `${stName(p.fromCode)} → ${stName(p.toCode)}` : whereLabel(p)}
                  </span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>
                  <span className={`dot ${p.delayMin >= 2 ? "late" : "live"}`} aria-hidden="true" />
                  {p.delayMin >= 2 ? `+${p.delayMin} min` : "À l’heure"}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="card about" aria-label="Méthode">
          <h2 className="card-title" style={{ marginBottom: 12 }}>Comment la position est calculée</h2>
          <p>Tant que le suivi est actif, les horaires d’arrivée estimés de chaque train sont récupérés toutes les 30 secondes.</p>
          <p>La position est interpolée entre le dernier arrêt desservi et le prochain, selon l’heure actuelle.</p>
          <p>La précision est d’environ une minute. Ce n’est pas une position GPS.</p>
          <p className="source muted">Source : Île-de-France Mobilités, API Prochains passages (requête globale)</p>
        </section>
      </div>

      {showCalls && (
        <section className="card calls" aria-label="Journal des appels API">
          <div className="card-head">
            <h2 className="card-title">Journal des appels API</h2>
            <span className="muted small">{calls.length === 0 ? "Aucun appel pour l’instant" : `${callCount.current} appel${callCount.current > 1 ? "s" : ""} depuis l’ouverture de la page`}</span>
          </div>
          {calls.length === 0 ? (
            <p className="empty">Chaque appel à l’API apparaîtra ici, avec un résumé des données reçues.</p>
          ) : (
            <ol className="call-list">
              {calls.map((c) => (
                <li key={c.n} className={c.ok ? "ok" : "ko"}>
                  <span className={`dot ${c.ok ? "live" : "late"}`} aria-hidden="true" />
                  <span className="tnum call-time">{hhmmss(c.at)}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="call-title">
                      {c.ok ? summaryLine(c) : `Échec${c.httpStatus ? ` (HTTP ${c.httpStatus})` : ""} : ${c.error}`}
                    </span>
                    <span className="muted small call-meta">{c.ok ? metaLine(c) : `${c.durationMs} ms`}</span>
                  </span>
                  <span className="muted small tnum">n° {c.n}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {showCalls && toast && (
        <div className={`toast ${toast.ok ? "ok" : "ko"}`} role="status">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`dot ${toast.ok ? "live" : "late"}`} aria-hidden="true" />
            <strong>{toast.ok ? "Appel API réussi" : "Échec de l’appel API"}</strong>
            <span className="muted small tnum" style={{ marginLeft: "auto" }}>n° {toast.n} · {hhmmss(toast.at)}</span>
            <button type="button" className="toast-close" aria-label="Fermer" onClick={() => setToast(null)}>×</button>
          </div>
          <p style={{ margin: "6px 0 0" }}>
            {toast.ok ? summaryLine(toast) : `${toast.error}${toast.httpStatus ? ` (HTTP ${toast.httpStatus})` : ""}`}
          </p>
          {toast.ok && <p className="muted small" style={{ margin: "4px 0 0" }}>{metaLine(toast)}</p>}
        </div>
      )}
    </main>
  );
}
