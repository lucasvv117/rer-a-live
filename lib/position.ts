import { STATIONS, pathFor, stationXY } from "./line";
import type { Call, Train } from "./prim";

export type Dir = "E" | "W";

export interface Placed {
  id: string;
  mission: string;
  label: string;
  dir: Dir;
  x: number;
  y: number;
  /** moving : entre deux gares ; atStop : à quai ; waiting : au terminus, départ imminent */
  state: "moving" | "atStop" | "waiting";
  fromCode: string;
  toCode: string | null;
  destName: string;
  originName: string;
  delayMin: number;
  upcoming: Call[];
}

/** Temps de parcours supposé quand la gare précédente n'est pas dans les données. */
const DEFAULT_HOP_MS = 150_000;
/** Un train arrivé au terminus disparaît après ce délai. */
const ARRIVED_GRACE_MS = 60_000;
/** Un train pas encore parti n'apparaît qu'à l'approche de son départ. */
const WAITING_WINDOW_MS = 120_000;

const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);
const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));

function between(a: string, b: string, u: number) {
  const A = stationXY(a);
  const B = stationXY(b);
  const ux = ease(u);
  // Sur un raccordement entre deux niveaux, le changement de niveau se fait au milieu du trajet.
  const uy = A.y === B.y ? 0 : ease(clamp01((u - 0.3) / 0.4));
  return { x: A.x + (B.x - A.x) * ux, y: A.y + (B.y - A.y) * uy };
}

function delayOf(c: Call | undefined): number {
  if (!c || c.aimedArr == null) return 0;
  return Math.max(0, Math.round((c.arr - c.aimedArr) / 60_000));
}

export function placeTrain(train: Train, now: number): Placed | null {
  const calls = train.calls;
  if (calls.length === 0) return null;

  const codes = calls.map((c) => c.code);
  if (train.originCode) codes.push(train.originCode);
  if (train.destCode) codes.push(train.destCode);
  const path = pathFor(codes);
  const idx = (c: string | null) => (c ? path.indexOf(c) : -1);

  const first = calls[0];
  const last = calls[calls.length - 1];
  let dir: Dir = "E";
  if (calls.length >= 2 && idx(first.code) >= 0 && idx(last.code) >= 0 && first.code !== last.code) {
    dir = idx(last.code) > idx(first.code) ? "E" : "W";
  } else if (idx(train.destCode) >= 0 && idx(first.code) >= 0) {
    dir = idx(train.destCode) >= idx(first.code) ? "E" : "W";
  }

  const base = {
    id: train.id,
    mission: train.mission,
    label: train.mission.slice(0, 4),
    dir,
    destName: train.destCode ? STATIONS[train.destCode].name : train.destName,
    originName: train.originCode ? STATIONS[train.originCode].name : train.originName,
  };

  // À quai ?
  const atIdx = calls.findIndex((c) => c.arr <= now && now <= c.dep);
  if (atIdx >= 0) {
    const c = calls[atIdx];
    const isOrigin = atIdx === 0 && c.code === train.originCode;
    return {
      ...base,
      ...stationXY(c.code),
      state: isOrigin ? "waiting" : "atStop",
      fromCode: c.code,
      toCode: calls[atIdx + 1]?.code ?? null,
      delayMin: delayOf(calls[atIdx + 1] ?? c),
      upcoming: calls.slice(atIdx + 1),
    };
  }

  const ni = calls.findIndex((c) => c.arr > now);
  if (ni === -1) {
    // Tous les arrêts sont passés : le train vient d'arriver ou les données sont périmées.
    if (now - last.dep > ARRIVED_GRACE_MS) return null;
    return { ...base, ...stationXY(last.code), state: "atStop", fromCode: last.code, toCode: null, delayMin: delayOf(last), upcoming: [] };
  }

  const next = calls[ni];
  const upcoming = calls.slice(ni);
  const delayMin = delayOf(next);

  let prevCode: string;
  let prevDep: number;
  if (ni > 0) {
    prevCode = calls[ni - 1].code;
    prevDep = calls[ni - 1].dep;
  } else {
    const k = idx(next.code);
    const pk = dir === "E" ? k - 1 : k + 1;
    const isOrigin = next.code === train.originCode || k < 0 || pk < 0 || pk >= path.length;
    if (isOrigin) {
      // Pas encore parti : affiché au terminus seulement si le départ est proche.
      if (next.arr - now > WAITING_WINDOW_MS) return null;
      return { ...base, ...stationXY(next.code), state: "waiting", fromCode: next.code, toCode: calls[1]?.code ?? null, delayMin, upcoming: calls.slice(1) };
    }
    prevCode = path[pk];
    prevDep = Math.min(next.arr - DEFAULT_HOP_MS, now);
  }

  const u = clamp01((now - prevDep) / Math.max(1, next.arr - prevDep));
  return { ...base, ...between(prevCode, next.code, u), state: "moving", fromCode: prevCode, toCode: next.code, delayMin, upcoming };
}

export function placeAll(trains: Train[], now: number): Placed[] {
  return trains.map((t) => placeTrain(t, now)).filter((p): p is Placed => p !== null);
}
