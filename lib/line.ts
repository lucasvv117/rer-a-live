// Topologie schématique du RER A et correspondance avec les identifiants IDFM.
// `sp` = identifiant de zone d'arrêt (STIF:StopArea:SP:<sp>:) utilisé par l'API PRIM.

export type Row = "mid" | "r2" | "r3";

export interface Station {
  name: string;
  col: number;
  row: Row;
  sp: string;
  terminus?: boolean;
}

export const STATIONS: Record<string, Station> = {
  // Branche A3 (Cergy) et tronc commun A3/A5
  CLH: { name: "Cergy-le-Haut", col: 0, row: "mid", sp: "43104", terminus: true },
  CSC: { name: "Cergy-Saint-Christophe", col: 1, row: "mid", sp: "47897" },
  CPR: { name: "Cergy-Préfecture", col: 2, row: "mid", sp: "44559" },
  NEU: { name: "Neuville-Université", col: 3, row: "mid", sp: "47879" },
  CFO: { name: "Conflans-Fin-d’Oise", col: 4, row: "mid", sp: "43114" },
  ACV: { name: "Achères-Ville", col: 5, row: "mid", sp: "46647" },
  MLA: { name: "Maisons-Laffitte", col: 6, row: "mid", sp: "473109" },
  SAR: { name: "Sartrouville", col: 7, row: "mid", sp: "43191" },
  HOU: { name: "Houilles–Carrières-sur-Seine", col: 8, row: "mid", sp: "43082" },
  // Branche A5 (Poissy)
  POI: { name: "Poissy", col: 4, row: "r2", sp: "47874", terminus: true },
  AGC: { name: "Achères-Grand-Cormier", col: 5, row: "r2", sp: "47915" },
  // Branche A1 (Saint-Germain-en-Laye)
  SGL: { name: "Saint-Germain-en-Laye", col: 2, row: "r3", sp: "43198", terminus: true },
  VLP: { name: "Le Vésinet–Le Pecq", col: 3, row: "r3", sp: "43237" },
  VCE: { name: "Le Vésinet–Centre", col: 4, row: "r3", sp: "53784" },
  CHA: { name: "Chatou–Croissy", col: 5, row: "r3", sp: "53783" },
  RUE: { name: "Rueil-Malmaison", col: 6, row: "r3", sp: "58875" },
  NVI: { name: "Nanterre-Ville", col: 7, row: "r3", sp: "43171" },
  NUN: { name: "Nanterre-Université", col: 8, row: "r3", sp: "43170" },
  // Tronc central
  NPR: { name: "Nanterre-Préfecture", col: 9, row: "mid", sp: "43169" },
  DEF: { name: "La Défense", col: 10, row: "mid", sp: "470549" },
  CDG: { name: "Charles de Gaulle–Étoile", col: 11, row: "mid", sp: "58759" },
  AUB: { name: "Auber", col: 12, row: "mid", sp: "45873" },
  CHL: { name: "Châtelet–Les Halles", col: 13, row: "mid", sp: "45102" },
  GDL: { name: "Gare de Lyon", col: 14, row: "mid", sp: "470195" },
  NAT: { name: "Nation", col: 15, row: "mid", sp: "473875" },
  VIN: { name: "Vincennes", col: 16, row: "mid", sp: "43224" },
  // Branche A4 (Marne-la-Vallée)
  VDF: { name: "Val de Fontenay", col: 17, row: "mid", sp: "47900" },
  NPL: { name: "Neuilly-Plaisance", col: 18, row: "mid", sp: "43172" },
  BRY: { name: "Bry-sur-Marne", col: 19, row: "mid", sp: "43101" },
  NMD: { name: "Noisy-le-Grand–Mont d’Est", col: 20, row: "mid", sp: "474082" },
  NCH: { name: "Noisy-Champs", col: 21, row: "mid", sp: "58937" },
  NOI: { name: "Noisiel", col: 22, row: "mid", sp: "44199" },
  LOG: { name: "Lognes", col: 23, row: "mid", sp: "43152" },
  TOR: { name: "Torcy", col: 24, row: "mid", sp: "43207", terminus: true },
  BSG: { name: "Bussy-Saint-Georges", col: 25, row: "mid", sp: "58874" },
  VEU: { name: "Val d’Europe", col: 26, row: "mid", sp: "43213" },
  MLV: { name: "Marne-la-Vallée–Chessy", col: 27, row: "mid", sp: "43239", terminus: true },
  // Branche A2 (Boissy-Saint-Léger)
  FSB: { name: "Fontenay-sous-Bois", col: 17, row: "r2", sp: "47238" },
  NSM: { name: "Nogent-sur-Marne", col: 18, row: "r2", sp: "47886" },
  JLP: { name: "Joinville-le-Pont", col: 19, row: "r2", sp: "43135" },
  SMC: { name: "Saint-Maur–Créteil", col: 20, row: "r2", sp: "44801" },
  PSM: { name: "Le Parc de Saint-Maur", col: 21, row: "r2", sp: "43234" },
  CHP: { name: "Champigny", col: 22, row: "r2", sp: "58270" },
  LVC: { name: "La Varenne–Chennevières", col: 23, row: "r2", sp: "43146" },
  SBO: { name: "Sucy–Bonneuil", col: 24, row: "r2", sp: "58792" },
  BSL: { name: "Boissy-Saint-Léger", col: 25, row: "r2", sp: "43094", terminus: true },
};

export const SP_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATIONS).map(([code, s]) => [s.sp, code]),
);

// Branches, toujours dans le sens ouest → est.
export const BRANCHES = {
  A1: ["SGL", "VLP", "VCE", "CHA", "RUE", "NVI", "NUN"],
  A3: ["CLH", "CSC", "CPR", "NEU", "CFO", "ACV", "MLA", "SAR", "HOU"],
  A5: ["POI", "AGC", "MLA", "SAR", "HOU"],
  TRUNK: ["NPR", "DEF", "CDG", "AUB", "CHL", "GDL", "NAT", "VIN"],
  A2: ["FSB", "NSM", "JLP", "SMC", "PSM", "CHP", "LVC", "SBO", "BSL"],
  A4: ["VDF", "NPL", "BRY", "NMD", "NCH", "NOI", "LOG", "TOR", "BSG", "VEU", "MLV"],
} as const;

const ONLY = {
  A1: new Set(BRANCHES.A1),
  A3: new Set(["CLH", "CSC", "CPR", "NEU", "CFO", "ACV"]),
  A5: new Set(["POI", "AGC"]),
  SHARED_WEST: new Set(["MLA", "SAR", "HOU"]),
  A2: new Set(BRANCHES.A2),
  A4: new Set(BRANCHES.A4),
};

/** Reconstitue le parcours (ouest → est) d'un train à partir des gares qu'il dessert. */
export function pathFor(codes: Iterable<string>): string[] {
  const set = new Set(codes);
  const has = (s: Set<string>) => [...set].some((c) => s.has(c));
  let west: readonly string[] = [];
  if (has(ONLY.A1)) west = BRANCHES.A1;
  else if (has(ONLY.A5)) west = BRANCHES.A5;
  else if (has(ONLY.A3) || has(ONLY.SHARED_WEST)) west = BRANCHES.A3;
  let east: readonly string[] = [];
  if (has(ONLY.A2)) east = BRANCHES.A2;
  else if (has(ONLY.A4)) east = BRANCHES.A4;
  return [...west, ...BRANCHES.TRUNK, ...east];
}

// Géométrie du plan (px)
export const MAP = { width: 1320, height: 540, x0: 24, step: 43, track: 6 };
export const ROW_Y: Record<Row, number> = { mid: 160, r2: 250, r3: 410 };

export function stationXY(code: string) {
  const s = STATIONS[code];
  return { x: MAP.x0 + s.col * MAP.step, y: ROW_Y[s.row] };
}

export const STRAIGHTS: Array<[number, number, Row]> = [
  [0, 27, "mid"],
  [4, 5, "r2"],
  [17, 25, "r2"],
  [2, 8, "r3"],
];

export const CONNECTORS: Array<[string, string]> = [
  ["NUN", "NPR"],
  ["AGC", "MLA"],
  ["VIN", "FSB"],
];
