// Curated offline corridor dataset. Coordinates and elevations are approximate public-map values
// (rounded), traffic and IRI baselines are demo estimates — good enough for a realistic profile,
// not survey data. These are the default path; OSRM / Open-Meteo only ever refine them.

export interface Waypoint {
  name: string;
  km: number;
  lat: number;
  lon: number;
  elevationM: number;
  /** Typical congestion 0..1 on the stretch starting here. */
  traffic: number;
  /** Typical International Roughness Index, m/km. */
  iri: number;
  /** Free-flow cruise speed for a car, km/h. */
  freeSpeedKmh: number;
}

export interface Corridor {
  id: string;
  name: string;
  shortName: string;
  /** Two-wheelers are barred from these access-controlled expressways. */
  twoWheelerBanned: boolean;
  waypoints: Waypoint[];
}

export const CORRIDORS: Corridor[] = [
  {
    id: "delhi-jaipur",
    name: "Delhi → Jaipur (NH48)",
    shortName: "DEL–JAI",
    twoWheelerBanned: false,
    waypoints: [
      { name: "Dhaula Kuan, Delhi", km: 0, lat: 28.5918, lon: 77.1615, elevationM: 225, traffic: 0.6, iri: 2.6, freeSpeedKmh: 55 },
      { name: "Kherki Daula Toll", km: 30, lat: 28.3957, lon: 76.9846, elevationM: 232, traffic: 0.5, iri: 2.8, freeSpeedKmh: 65 },
      { name: "Manesar", km: 42, lat: 28.359, lon: 76.937, elevationM: 265, traffic: 0.35, iri: 3.0, freeSpeedKmh: 75 },
      { name: "Dharuhera", km: 62, lat: 28.2056, lon: 76.796, elevationM: 255, traffic: 0.3, iri: 3.2, freeSpeedKmh: 80 },
      { name: "Bawal", km: 82, lat: 28.075, lon: 76.5833, elevationM: 272, traffic: 0.22, iri: 2.9, freeSpeedKmh: 85 },
      { name: "Neemrana", km: 115, lat: 27.989, lon: 76.387, elevationM: 300, traffic: 0.2, iri: 2.8, freeSpeedKmh: 85 },
      { name: "Behror", km: 125, lat: 27.888, lon: 76.287, elevationM: 332, traffic: 0.25, iri: 3.1, freeSpeedKmh: 80 },
      { name: "Kotputli", km: 160, lat: 27.702, lon: 76.199, elevationM: 380, traffic: 0.3, iri: 3.6, freeSpeedKmh: 75 },
      { name: "Shahpura", km: 200, lat: 27.389, lon: 75.959, elevationM: 440, traffic: 0.25, iri: 3.4, freeSpeedKmh: 80 },
      { name: "Chandwaji", km: 222, lat: 27.2, lon: 75.87, elevationM: 420, traffic: 0.3, iri: 3.0, freeSpeedKmh: 75 },
      { name: "Jaipur (Ajmeri Gate)", km: 268, lat: 26.9124, lon: 75.7873, elevationM: 431, traffic: 0.5, iri: 3.0, freeSpeedKmh: 45 },
    ],
  },
  {
    id: "mumbai-pune",
    name: "Mumbai → Pune Expressway",
    shortName: "BOM–PNQ",
    twoWheelerBanned: true,
    waypoints: [
      { name: "Kalamboli", km: 0, lat: 19.033, lon: 73.101, elevationM: 12, traffic: 0.4, iri: 2.2, freeSpeedKmh: 70 },
      { name: "Shedung Toll", km: 10, lat: 18.9667, lon: 73.1489, elevationM: 30, traffic: 0.2, iri: 2.0, freeSpeedKmh: 90 },
      { name: "Khalapur Food Mall", km: 32, lat: 18.827, lon: 73.28, elevationM: 60, traffic: 0.2, iri: 2.0, freeSpeedKmh: 90 },
      { name: "Khopoli (ghat foot)", km: 40, lat: 18.786, lon: 73.346, elevationM: 80, traffic: 0.35, iri: 2.4, freeSpeedKmh: 60 },
      { name: "Khandala (ghat top)", km: 49, lat: 18.76, lon: 73.38, elevationM: 560, traffic: 0.3, iri: 2.3, freeSpeedKmh: 70 },
      { name: "Lonavala", km: 55, lat: 18.7537, lon: 73.4062, elevationM: 625, traffic: 0.2, iri: 2.1, freeSpeedKmh: 90 },
      { name: "Kamshet", km: 70, lat: 18.764, lon: 73.553, elevationM: 600, traffic: 0.15, iri: 2.0, freeSpeedKmh: 95 },
      { name: "Talegaon", km: 82, lat: 18.735, lon: 73.675, elevationM: 590, traffic: 0.25, iri: 2.1, freeSpeedKmh: 85 },
      { name: "Kiwale / Dehu Road", km: 94, lat: 18.66, lon: 73.73, elevationM: 575, traffic: 0.45, iri: 2.6, freeSpeedKmh: 55 },
    ],
  },
  {
    id: "bengaluru-mysuru",
    name: "Bengaluru → Mysuru Expressway",
    shortName: "BLR–MYS",
    twoWheelerBanned: true,
    waypoints: [
      { name: "Kengeri, Bengaluru", km: 0, lat: 12.908, lon: 77.485, elevationM: 860, traffic: 0.5, iri: 2.6, freeSpeedKmh: 50 },
      { name: "Bidadi", km: 18, lat: 12.797, lon: 77.388, elevationM: 760, traffic: 0.2, iri: 2.0, freeSpeedKmh: 90 },
      { name: "Ramanagara", km: 32, lat: 12.715, lon: 77.281, elevationM: 747, traffic: 0.15, iri: 1.9, freeSpeedKmh: 95 },
      { name: "Channapatna", km: 45, lat: 12.651, lon: 77.209, elevationM: 740, traffic: 0.15, iri: 1.9, freeSpeedKmh: 95 },
      { name: "Maddur", km: 64, lat: 12.584, lon: 77.044, elevationM: 680, traffic: 0.15, iri: 2.0, freeSpeedKmh: 95 },
      { name: "Mandya", km: 82, lat: 12.522, lon: 76.897, elevationM: 690, traffic: 0.2, iri: 2.1, freeSpeedKmh: 90 },
      { name: "Srirangapatna", km: 102, lat: 12.414, lon: 76.704, elevationM: 680, traffic: 0.25, iri: 2.3, freeSpeedKmh: 80 },
      { name: "Mysuru", km: 118, lat: 12.305, lon: 76.655, elevationM: 770, traffic: 0.5, iri: 2.8, freeSpeedKmh: 45 },
    ],
  },
];

export function getCorridor(id: string): Corridor {
  const c = CORRIDORS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown corridor: ${id}`);
  return c;
}

/** Closest point on any corridor to a GPS fix: projects onto each waypoint-to-waypoint leg. */
export function nearestOnCorridors(lat: number, lon: number): { corridorId: string; km: number; distKm: number; near: string } {
  // Local flat-earth km per degree; fine at a few hundred km, which is all we compare.
  const ky = 111.32, kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  let best = { corridorId: CORRIDORS[0].id, km: 0, distKm: Infinity, near: "" };
  for (const c of CORRIDORS) {
    const w = c.waypoints;
    for (let i = 1; i < w.length; i++) {
      const ax = (w[i - 1].lon - lon) * kx, ay = (w[i - 1].lat - lat) * ky;
      const bx = (w[i].lon - lon) * kx, by = (w[i].lat - lat) * ky;
      const dx = bx - ax, dy = by - ay;
      const t = Math.min(1, Math.max(0, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < best.distKm) best = { corridorId: c.id, km: lerp(w[i - 1].km, w[i].km, t), distKm: d, near: (t < 0.5 ? w[i - 1] : w[i]).name };
    }
  }
  return best;
}

export interface Segment {
  startKm: number;
  endKm: number;
  lengthM: number;
  /** Road slope angle, radians (positive = uphill). */
  gradeRad: number;
  elevStartM: number;
  elevEndM: number;
  lat: number;
  lon: number;
  baseTraffic: number;
  baseIri: number;
  freeSpeedKmh: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Cut a corridor into ~1 km micro-segments by linear interpolation between waypoints. */
export function buildSegments(corridor: Corridor, stepKm = 1): Segment[] {
  const wps = corridor.waypoints;
  const totalKm = wps[wps.length - 1].km;
  const at = (km: number) => {
    let i = 0;
    while (i < wps.length - 2 && km >= wps[i + 1].km) i++;
    const a = wps[i];
    const b = wps[i + 1];
    const t = (km - a.km) / (b.km - a.km);
    return {
      lat: lerp(a.lat, b.lat, t),
      lon: lerp(a.lon, b.lon, t),
      elevationM: lerp(a.elevationM, b.elevationM, t),
      traffic: lerp(a.traffic, b.traffic, t),
      iri: lerp(a.iri, b.iri, t),
      freeSpeedKmh: lerp(a.freeSpeedKmh, b.freeSpeedKmh, t),
    };
  };

  const segments: Segment[] = [];
  for (let start = 0; start < totalKm - 1e-9; start += stepKm) {
    const end = Math.min(totalKm, start + stepKm);
    const p0 = at(start);
    const p1 = at(end);
    const mid = at((start + end) / 2);
    const lengthM = (end - start) * 1000;
    segments.push({
      startKm: start,
      endKm: end,
      lengthM,
      gradeRad: Math.atan((p1.elevationM - p0.elevationM) / lengthM),
      elevStartM: p0.elevationM,
      elevEndM: p1.elevationM,
      lat: mid.lat,
      lon: mid.lon,
      baseTraffic: mid.traffic,
      baseIri: mid.iri,
      freeSpeedKmh: mid.freeSpeedKmh,
    });
  }
  return segments;
}
