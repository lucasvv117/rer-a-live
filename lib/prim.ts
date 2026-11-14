import { SP_TO_CODE } from "./line";

export const RER_A_LINE_REF = "STIF:Line::C01742:";

/** Un arrêt à venir (ou tout juste desservi) d'un train. Heures en ms epoch. */
export interface Call {
  code: string;
  arr: number;
  dep: number;
  aimedArr: number | null;
  status: string;
}

export interface Train {
  id: string;
  mission: string;
  originCode: string | null;
  destCode: string | null;
  originName: string;
  destName: string;
  calls: Call[];
}

export interface TrainsPayload {
  fetchedAt: string;
  responseTimestamp: string | null;
  trains: Train[];
}

// Types minimaux de la réponse SIRI Lite (estimated-timetable).
type V = { value?: string };
interface SiriCall {
  StopPointRef?: V;
  ExpectedArrivalTime?: string;
  ExpectedDepartureTime?: string;
  AimedArrivalTime?: string;
  AimedDepartureTime?: string;
  ArrivalStatus?: string;
  DepartureStatus?: string;
}
interface SiriJourney {
  DatedVehicleJourneyRef?: V;
  VehicleJourneyName?: V[];
  JourneyNote?: V[];
  OriginRef?: V;
  OriginName?: V[];
  DestinationRef?: V;
  DestinationName?: V[];
  EstimatedCalls?: { EstimatedCall?: SiriCall[] };
}

const spOf = (ref?: string) => (ref ? ref.split(":")[3] ?? null : null);
const ms = (s?: string) => (s ? Date.parse(s) : NaN);

export function toTrains(json: unknown): TrainsPayload {
  const delivery = (json as any)?.Siri?.ServiceDelivery;
  const frames = delivery?.EstimatedTimetableDelivery?.[0]?.EstimatedJourneyVersionFrame ?? [];
  const journeys: SiriJourney[] = frames.flatMap((f: any) => f.EstimatedVehicleJourney ?? []);

  const trains: Train[] = [];
  for (const j of journeys) {
    const calls: Call[] = [];
    for (const c of j.EstimatedCalls?.EstimatedCall ?? []) {
      const code = SP_TO_CODE[spOf(c.StopPointRef?.value) ?? ""];
      if (!code) continue;
      let arr = ms(c.ExpectedArrivalTime ?? c.AimedArrivalTime);
      let dep = ms(c.ExpectedDepartureTime ?? c.AimedDepartureTime);
      if (Number.isNaN(arr)) arr = dep;
      if (Number.isNaN(dep)) dep = arr;
      if (Number.isNaN(arr)) continue;
      const aimed = ms(c.AimedArrivalTime ?? c.AimedDepartureTime);
      calls.push({
        code,
        arr,
        dep: Math.max(dep, arr),
        aimedArr: Number.isNaN(aimed) ? null : aimed,
        status: c.ArrivalStatus || c.DepartureStatus || "",
      });
    }
    if (calls.length === 0) continue;
    calls.sort((a, b) => a.arr - b.arr);
    const oSp = spOf(j.OriginRef?.value);
    const dSp = spOf(j.DestinationRef?.value);
    trains.push({
      id: j.DatedVehicleJourneyRef?.value ?? `${j.VehicleJourneyName?.[0]?.value}-${calls[0].arr}`,
      mission: j.VehicleJourneyName?.[0]?.value ?? j.JourneyNote?.[0]?.value ?? "????",
      originCode: oSp ? SP_TO_CODE[oSp] ?? null : null,
      destCode: dSp ? SP_TO_CODE[dSp] ?? null : null,
      originName: j.OriginName?.[0]?.value ?? "",
      destName: j.DestinationName?.[0]?.value ?? "",
      calls,
    });
  }

  return {
    fetchedAt: new Date().toISOString(),
    responseTimestamp: delivery?.ResponseTimestamp ?? null,
    trains,
  };
}
