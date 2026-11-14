import { NextResponse } from "next/server";
import { RER_A_LINE_REF, toTrains } from "@/lib/prim";

// Une seule requête PRIM toutes les 30 s au maximum, partagée entre tous les visiteurs.
const CACHE_SECONDS = 30;

export async function GET() {
  const apiKey = process.env.PRIM_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "PRIM_API_KEY manquante côté serveur." }, { status: 500 });
  }

  const url =
    "https://prim.iledefrance-mobilites.fr/marketplace/estimated-timetable?LineRef=" +
    encodeURIComponent(RER_A_LINE_REF);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { apiKey, accept: "application/json" },
      next: { revalidate: CACHE_SECONDS },
    });
  } catch {
    return NextResponse.json({ error: "API PRIM injoignable." }, { status: 502 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: `API PRIM : erreur ${res.status}.` }, { status: 502 });
  }

  const payload = toTrains(await res.json());
  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=10`,
    },
  });
}
