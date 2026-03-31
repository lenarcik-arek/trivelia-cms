"use client";

import { useCallback, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { createQuizStop, deleteQuizStop, type QuizStop } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Trash2,
  MousePointerClick,
} from "lucide-react";

// Fix Leaflet default marker icon issue with bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Custom marker icons
function createCustomIcon(color: string, letter: string = "Q") {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      width: 32px; height: 32px;
      background: ${color};
      border: 3px solid white;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
    "><div style="
      transform: rotate(45deg);
      color: white; font-weight: 700; font-size: 12px;
    ">${letter}</div></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

const typeIcons: Record<string, L.DivIcon> = {
  normal: createCustomIcon("#3b82f6", "N"), // Blue for normal
  premium: createCustomIcon("#f59e0b", "P"), // Amber/Gold for premium
};

interface ParsedQuizStop extends QuizStop {
  lat: number;
  lng: number;
}

function parseLocation(location: any): { lat: number; lng: number } {
  if (!location) return { lat: 52.2297, lng: 21.0122 };
  
  if (typeof location === 'string') {
    const coords = location.replace("POINT(", "").replace(")", "").trim().split(" ");
    const lng = parseFloat(coords[0]);
    const lat = parseFloat(coords[1]);
    if (isNaN(lng) || isNaN(lat)) return { lat: 52.2297, lng: 21.0122 };
    return { lat, lng };
  }

  if (location && location.type === 'Point' && Array.isArray(location.coordinates)) {
    return { lat: parseFloat(location.coordinates[1]), lng: parseFloat(location.coordinates[0]) };
  }

  return { lat: 52.2297, lng: 21.0122 };
}

// ----------- Single click handler inside map -----------
interface ClickHandlerProps {
  onMapClick: (lat: number, lng: number) => void;
  addMode: string | null; // "normal" | "premium" | null
}

function SingleClickHandler({ onMapClick, addMode }: ClickHandlerProps) {
  useMapEvents({
    click(e) {
      if (addMode) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });

  return null;
}

// ----------- Main component -----------

interface QuizStopsMapProps {
  initialStops: QuizStop[];
}

export default function QuizStopsMap({ initialStops }: QuizStopsMapProps) {
  const [stops, setStops] = useState<ParsedQuizStop[]>(() => {
    const parsed = initialStops.map((s) => ({ ...s, ...parseLocation(s.location) }));
    // Diagnostic log
    console.log(`[QuizStopsMap] Received ${initialStops.length} stops from server`);
    console.log(`[QuizStopsMap] Parsed ${parsed.length} stops`);
    const invalid = parsed.filter(s => isNaN(s.lat) || isNaN(s.lng));
    console.log(`[QuizStopsMap] Invalid (NaN coords): ${invalid.length}`, invalid.map(s => ({ id: s.id, location: s.location })));
    const defaultPos = parsed.filter(s => s.lat === 52.2297 && s.lng === 21.0122);
    console.log(`[QuizStopsMap] Fell back to default Warsaw position: ${defaultPos.length}`, defaultPos.map(s => ({ id: s.id, location: s.location })));
    return parsed;
  });
  
  // "null" means saving/creating is off, otherwise 'normal' or 'premium'
  const [addMode, setAddMode] = useState<"normal" | "premium" | null>(null);
  
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    if (!addMode) return;
    
    // Create right away
    const type = addMode;
    const result = await createQuizStop(lat, lng, type);
    
    if (result.success && result.data) {
      const newStop: ParsedQuizStop = {
        ...result.data,
        lat: lat,
        lng: lng,
      };
      setStops((prev) => [newStop, ...prev]);
    } else if (result.success) {
      // Fallback if data is not returned but success is true (shouldn't happen with .select())
      const expiresAtDate = new Date();
      expiresAtDate.setHours(expiresAtDate.getHours() + 24);
      const newStop: ParsedQuizStop = {
        id: crypto.randomUUID(),
        type: type,
        categories: type === "normal" ? ["Generowanie..."] : [],
        location: `POINT(${lng} ${lat})`,
        coin_budget: 20,
        expires_at: expiresAtDate.toISOString(),
        created_at: new Date().toISOString(),
        lat: lat,
        lng: lng,
      };
      setStops((prev) => [newStop, ...prev]);
    } else {
      alert("Błąd: " + result.error);
    }
  }, [addMode]);

  const handleDelete = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten Quiz Stop?")) return;
    setDeletingId(id);
    const result = await deleteQuizStop(id);
    if (result.success) {
      setStops((prev) => prev.filter((s) => s.id !== id));
    } else {
      alert("Błąd usuwania: " + result.error);
    }
    setDeletingId(null);
  };

  // Center on Warsaw or first valid stop
  const validStops = stops.filter(s => !isNaN(s.lat) && !isNaN(s.lng));
  const center: [number, number] =
    validStops.length > 0
      ? [validStops[0].lat, validStops[0].lng]
      : [52.2297, 21.0122];

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Quiz Stopy</h1>
          <p className="text-slate-500 mt-1">
            Zarządzaj punktami quiz na mapie. Włącz <strong>Tryb Dodawania</strong> aby tworzyć punkty jednym kliknięciem.
          </p>
        </div>
        <Badge variant="secondary" className="text-sm py-1 px-3">
          <MapPin className="w-4 h-4 mr-1" />
          {stops.length} {stops.length === 1 ? "punkt" : "punktów"}
        </Badge>
      </div>

      {/* Creation mode bar */}
      <Card className={`border transition-colors ${addMode ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}>
        <CardContent className="py-3 px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-700 font-medium">
            <MousePointerClick className="w-5 h-5" />
            Tryb dodawania:
          </div>
          
          <div className="flex gap-2">
            <Button
              variant={addMode === null ? "default" : "outline"}
              onClick={() => setAddMode(null)}
              className={addMode === null ? "bg-slate-800" : ""}
            >
              Wyłączony
            </Button>
            <Button
              variant={addMode === "normal" ? "default" : "outline"}
              onClick={() => setAddMode("normal")}
              className={addMode === "normal" ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              Normalny
            </Button>
            <Button
              variant={addMode === "premium" ? "default" : "outline"}
              onClick={() => setAddMode("premium")}
              className={addMode === "premium" ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
            >
              Premium
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Map */}
      <div className={`rounded-xl overflow-hidden border shadow-sm relative transition-all ${addMode ? "ring-2 ring-amber-400" : "border-slate-200"}`}>
        <style>{`
          .leaflet-container { font-family: inherit; }
          .leaflet-container.crosshair-cursor { cursor: crosshair !important; }
        `}</style>
        <MapContainer
          center={center}
          zoom={15}
          style={{ height: "60vh", width: "100%" }}
          zoomControl={true}
          className={addMode ? "crosshair-cursor" : ""}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <SingleClickHandler
            onMapClick={handleMapClick}
            addMode={addMode}
          />

          {/* Existing stops */}
          {validStops.map((stop) => (
            <Marker
              key={stop.id}
              position={[stop.lat, stop.lng]}
              icon={typeIcons[stop.type] || typeIcons.normal}
            >
              <Popup>
                <div className="space-y-2 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold text-white ${
                        stop.type === "premium" ? "bg-amber-500" : "bg-blue-500"
                      }`}
                    >
                      {stop.type === "premium" ? "PREMIUM" : "NORMAL"}
                    </span>
                    <span className="font-mono text-xs text-slate-500" title={stop.id}>
                      ...{stop.id.slice(-6)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 space-y-1">
                    {stop.categories && stop.categories.length > 0 && (
                      <p>📚 <b>Kategorie:</b> {stop.categories.join(", ")}</p>
                    )}
                    <p>🪙 <b>Budżet:</b> {stop.coin_budget} monet</p>
                    <p>⏰ <b>Wygasa:</b> {new Date(stop.expires_at).toLocaleString()}</p>
                    <p className="font-mono text-[10px] text-slate-400">
                      📍 {stop.lat.toFixed(6)}, {stop.lng.toFixed(6)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(stop.id)}
                    disabled={deletingId === stop.id}
                    className="w-full mt-1 px-3 py-1.5 text-xs bg-red-50 text-red-600 hover:bg-red-100 rounded-md transition-colors flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    {deletingId === stop.id ? "Usuwanie..." : "Usuń"}
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Stops list */}
      {validStops.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Wszystkie Quiz Stopy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              {validStops.map((stop) => (
                <div
                  key={stop.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                        stop.type === "premium" ? "bg-amber-500" : "bg-blue-500"
                      }`}
                    >
                      {stop.type === "premium" ? "PREM" : "NORM"}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        Quiz Stop <span className="text-slate-400 font-mono font-normal">...{stop.id.slice(-6)}</span>
                      </p>
                      {stop.categories && stop.categories.length > 0 && (
                        <p className="text-xs text-slate-500">
                          {stop.categories.join(", ")}
                        </p>
                      )}
                      <p className="text-xs text-slate-400">
                        {stop.coin_budget} 🪙 • Wygasa: {new Date(stop.expires_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(stop.id)}
                    disabled={deletingId === stop.id}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
