import { DEFAULT_MAP_CENTER } from "./constants";

/**
 * Parses various location formats from Supabase/PostGIS into { lat, lng }.
 * Supports: POINT(lng lat), (lng,lat), GeoJSON, plain object.
 */
/**
 * Basic hex EWKB parser for Point (2D)
 * Supabase returns geography/geometry as hex strings like:
 * 0101000020E6100000A1BA47F9BA013540BAF14F1C7F194A40
 */
function hexToDouble(hex: string, offset: number): number {
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    bytes[i] = parseInt(hex.slice(offset + i * 2, offset + i * 2 + 2), 16);
  }
  const view = new DataView(bytes.buffer);
  return view.getFloat64(0, true); // true for little endian
}

export function parseLocation(location: unknown): { lat: number; lng: number } {
  const [defaultLat, defaultLng] = DEFAULT_MAP_CENTER;
  const defaultPos = { lat: defaultLat, lng: defaultLng };

  if (!location) return defaultPos;

  // If already in correct format
  if (typeof location === "object" && location !== null && "lat" in location && "lng" in location) {
    const l = location as any;
    if (!isNaN(parseFloat(l.lat)) && !isNaN(parseFloat(l.lng))) {
      return { lat: parseFloat(l.lat), lng: parseFloat(l.lng) };
    }
  }

  try {
    // 1. String formats
    if (typeof location === "string") {
      // Hex check (EWKB) - detect Point
      if (location.match(/^[0-9a-fA-F]{32,}$/)) {
        try {
          // Detect endianness (01 = little, 00 = big) - we assume little for now
          // Point 2D without SRID: 01 01000000 X (8 bytes) Y (8 bytes) = 10 hex
          // Point 2D with SRID:    01 01000020 E6100000 X (8 bytes) Y (8 bytes) = 18 hex prefix
          let offset = 0;
          if (location.startsWith("0101000020")) {
            offset = 18; // Includes SRID
          } else if (location.startsWith("0101000000")) {
            offset = 10; // No SRID
          }

          if (offset > 0) {
            const lng = hexToDouble(location, offset);
            const lat = hexToDouble(location, offset + 16);
            if (!isNaN(lng) && !isNaN(lat)) return { lat, lng };
          }
        } catch (hexErr) {
          console.warn("[geo] Hex parsing failed:", hexErr);
        }
      }

      const clean = location
        .replace(/POINT|point/i, "")
        .replace(/[\(\)]/g, "")
        .trim();
      
      const coords = clean.split(/[\s,]+/);
      if (coords.length >= 2) {
        // Standard POINT(lng lat) or lat,lng
        const v1 = parseFloat(coords[0]);
        const v2 = parseFloat(coords[1]);
        
        if (!isNaN(v1) && !isNaN(v2)) {
          // Heuristic to decide order
          if (v1 > 40 && v1 < 60 && v2 > 10 && v2 < 30) {
            return { lat: v1, lng: v2 };
          }
          return { lat: v2, lng: v1 };
        }
      }
    }

    // 2. Object formats
    if (typeof location === "object" && location !== null) {
      const loc = location as any;
      if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
        return { lat: loc.coordinates[1], lng: loc.coordinates[0] };
      }
      if ("x" in loc && "y" in loc) {
        return { lat: loc.y, lng: loc.x };
      }
    }
  } catch (err) {
    console.error("[geo] Error parsing location:", err, location);
  }

  return defaultPos;
}
