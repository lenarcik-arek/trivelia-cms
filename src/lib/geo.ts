import { DEFAULT_MAP_CENTER } from "./constants";

/**
 * Parses various location formats from Supabase/PostGIS into { lat, lng }.
 * Supports: POINT(lng lat), (lng,lat), GeoJSON, plain object.
 */
export function parseLocation(location: unknown): { lat: number; lng: number } {
  const [defaultLat, defaultLng] = DEFAULT_MAP_CENTER;
  const defaultPos = { lat: defaultLat, lng: defaultLng };

  if (!location) return defaultPos;

  try {
    // 1. String formats: 'POINT(lng lat)', '(lng,lat)', 'lng,lat'
    if (typeof location === "string") {
      const clean = location
        .replace("POINT(", "")
        .replace(/\)/g, "")
        .replace("(", "")
        .trim();
      const coords = clean.split(/[\s,]+/);
      if (coords.length >= 2) {
        const lng = parseFloat(coords[0]);
        const lat = parseFloat(coords[1]);
        if (!isNaN(lng) && !isNaN(lat)) return { lat, lng };
      }
    }

    // 2. GeoJSON: { type: 'Point', coordinates: [lng, lat] }
    if (
      typeof location === "object" &&
      location !== null &&
      "type" in location &&
      (location as Record<string, unknown>).type === "Point" &&
      "coordinates" in location &&
      Array.isArray((location as Record<string, unknown>).coordinates)
    ) {
      const coords = (location as unknown as { coordinates: number[] }).coordinates;
      return { lat: coords[1], lng: coords[0] };
    }

    // 3. Plain object: { lat, lng }
    if (
      typeof location === "object" &&
      location !== null &&
      "lat" in location &&
      "lng" in location
    ) {
      const obj = location as { lat: number; lng: number };
      return { lat: parseFloat(String(obj.lat)), lng: parseFloat(String(obj.lng)) };
    }
  } catch (err) {
    console.error("[geo] Error parsing location:", err, location);
  }

  return defaultPos;
}
