"use client";

import { useCallback, useState, useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import MarkerClusterGroup from "react-leaflet-cluster";
import { toast } from "sonner";

import { createQuizStop, deleteQuizStop, type QuizStop } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

import { parseLocation } from "@/lib/geo";
import { fixLeafletIcons, typeIcons } from "@/lib/map-icons";
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  FOCUSED_MAP_ZOOM,
  MAP_TILE_URL,
  MAP_TILE_ATTRIBUTION,
} from "@/lib/constants";
import type { QuizStopStatus, QuizStopType } from "@/types";

import { MapAddModeBar } from "./components/map-add-mode-bar";
import { QuizStopsFilters } from "./components/quiz-stops-filters";
import { QuizStopsTable } from "./components/quiz-stops-table";
import { DeleteConfirmationDialog, isDeleteConfirmationRequired } from "@/components/dashboard/delete-confirmation-dialog";

// ── Init ──────────────────────────────────────────────────────────────
fixLeafletIcons();

// ── Types ─────────────────────────────────────────────────────────────
interface ParsedQuizStop extends QuizStop {
  lat: number;
  lng: number;
}

// ── Helpers ───────────────────────────────────────────────────────────
function getStatus(stop: QuizStop): QuizStopStatus {
  const isExpired = new Date(stop.expires_at) < new Date();
  const isOutOfCoins = stop.coin_budget <= 0;
  return isExpired || isOutOfCoins ? "inactive" : "active";
}

// ── Sub-components ────────────────────────────────────────────────────
function MapController({ center, zoom }: { center: [number, number]; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (center[0] !== 0 && center[1] !== 0) {
      map.setView(center, zoom ?? map.getZoom());
    }
  }, [center, zoom, map]);
  return null;
}

function MapEventsHandler({
  onMapClick,
  addMode,
}: {
  onMapClick: (lat: number, lng: number) => void;
  addMode: QuizStopType | null;
}) {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      if (addMode) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// ── Main Component ────────────────────────────────────────────────────
interface QuizStopsMapProps {
  initialStops: QuizStop[];
}

export default function QuizStopsMap({ initialStops }: QuizStopsMapProps) {
  // ── State ─────────────────────────────────────────────────────────
  const [stops, setStops] = useState<ParsedQuizStop[]>(() =>
    initialStops.map((s) => ({ ...s, ...parseLocation(s.location) }))
  );
  const [addMode, setAddMode] = useState<QuizStopType | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mapTarget, setMapTarget] = useState<[number, number] | null>(null);

  // Deletion Dialog State
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    onConfirm: () => Promise<void> | void;
  }>({
    open: false,
    onConfirm: () => {},
  });

  // Filters
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [sortField, setSortField] = useState<"created_at" | "expires_at">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // ── Handlers ──────────────────────────────────────────────────────
  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      if (!addMode) return;
      const result = await createQuizStop(lat, lng, addMode);
      if (result.success && result.data) {
        setStops((prev) => [{ ...result.data!, lat, lng }, ...prev]);
        toast.success("Quiz Stop dodany pomyślnie.");
      } else {
        toast.error("Błąd: " + result.error);
      }
    },
    [addMode]
  );

  const deleteStopFinal = async (id: string) => {
    setDeletingId(id);
    const result = await deleteQuizStop(id);
    if (result.success) {
      setStops((prev) => prev.filter((s) => s.id !== id));
      toast.success("Quiz Stop usunięty.");
    } else {
      toast.error("Błąd usuwania: " + result.error);
    }
    setDeletingId(null);
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    const action = () => deleteStopFinal(id);
    if (!isDeleteConfirmationRequired()) {
      action();
      return;
    }

    setDeleteDialog({
      open: true,
      onConfirm: action,
    });
  };

  const handleShowOnMap = (lat: number, lng: number) => {
    setMapTarget([lat, lng]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Derived data ──────────────────────────────────────────────────
  const allCategories = useMemo(
    () => Array.from(new Set(stops.flatMap((s) => s.categories || []))).sort(),
    [stops]
  );

  const filteredStops = useMemo(() => {
    const result = stops.filter((s) => {
      if (filterStatus !== "all" && getStatus(s) !== filterStatus) return false;
      if (filterType !== "all" && s.type !== filterType) return false;
      if (filterCategory !== "all" && !(s.categories || []).includes(filterCategory))
        return false;
      return true;
    });
    result.sort((a, b) => {
      const valA = new Date(a[sortField]).getTime();
      const valB = new Date(b[sortField]).getTime();
      return sortOrder === "desc" ? valB - valA : valA - valB;
    });
    return result;
  }, [stops, filterStatus, filterType, filterCategory, sortField, sortOrder]);

  const initialCenter = useMemo<[number, number]>(() => {
    const valid = stops.filter((s) => !isNaN(s.lat) && !isNaN(s.lng));
    return valid.length > 0 ? [valid[0].lat, valid[0].lng] : DEFAULT_MAP_CENTER;
  }, [stops]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pt-2">
      <MapAddModeBar addMode={addMode} onModeChange={setAddMode} />

      {/* Map */}
      <div
        className={`rounded-2xl overflow-hidden border-2 shadow-lg relative transition-all ${
          addMode
            ? "ring-4 ring-amber-400/20 border-amber-300"
            : "border-slate-200"
        }`}
      >
        <style>{`
          .leaflet-container { font-family: inherit; z-index: 10; }
          .leaflet-container.crosshair-cursor { cursor: crosshair !important; }
          .marker-cluster div {
            width: 30px; height: 30px; margin-left: 5px; margin-top: 5px;
            border-radius: 15px; text-align: center; font-variant: tabular-nums;
            font-size: 12px; font-weight: bold; display: flex;
            align-items: center; justify-content: center; color: white;
            background: #333;
          }
          .marker-cluster-small { background-color: rgba(181, 226, 140, 0.6); }
          .marker-cluster-small div { background-color: #6ecc39; }
          .marker-cluster-medium { background-color: rgba(241, 211, 87, 0.6); }
          .marker-cluster-medium div { background-color: #f0c20c; }
          .marker-cluster-large { background-color: rgba(253, 156, 115, 0.6); }
          .marker-cluster-large div { background-color: #f18017; }
        `}</style>

        <MapContainer
          center={initialCenter}
          zoom={DEFAULT_MAP_ZOOM}
          style={{ height: "65vh", width: "100%" }}
          zoomControl
          className={addMode ? "crosshair-cursor" : ""}
        >
          <TileLayer attribution={MAP_TILE_ATTRIBUTION} url={MAP_TILE_URL} />
          <MapController
            center={mapTarget || initialCenter}
            zoom={mapTarget ? FOCUSED_MAP_ZOOM : undefined}
          />
          <MapEventsHandler onMapClick={handleMapClick} addMode={addMode} />

          <MarkerClusterGroup
            key={`cluster-${stops.length}-${filterStatus}-${filterType}`}
            chunkedLoading
          >
            {filteredStops.map((stop) => (
              <Marker
                key={`${stop.id}-${stop.lat}-${stop.lng}`}
                position={[stop.lat, stop.lng]}
                icon={typeIcons[stop.type] || typeIcons.normal}
              >
                <Popup>
                  <div className="p-1 space-y-3 min-w-[200px]">
                    <div className="flex items-center justify-between border-b pb-2">
                      <Badge
                        className={
                          stop.type === "premium" ? "bg-amber-500" : "bg-blue-500"
                        }
                      >
                        {stop.type.toUpperCase()}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          getStatus(stop) === "active"
                            ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                            : "text-red-600 bg-red-50 border-red-200"
                        }
                      >
                        {getStatus(stop).toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-xs space-y-1.5 text-slate-600">
                      <div>
                        <b>📦 Kategorie:</b> {stop.categories?.join(", ") || "Brak"}
                      </div>
                      <div>
                        <b>🪙 Budżet:</b> {stop.coin_budget} monet
                      </div>
                      <div>
                        <b>🕒 Wygasa:</b> {new Date(stop.expires_at).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={(e) => handleDelete(e, stop.id)}
                      disabled={deletingId === stop.id}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Usuń punkt
                    </Button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      {/* Filters + Table */}
      <div className="space-y-4">
        <QuizStopsFilters
          filterStatus={filterStatus}
          onFilterStatusChange={setFilterStatus}
          filterType={filterType}
          onFilterTypeChange={setFilterType}
          filterCategory={filterCategory}
          onFilterCategoryChange={setFilterCategory}
          sortField={sortField}
          onSortFieldChange={setSortField}
          sortOrder={sortOrder}
          onSortOrderChange={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
          allCategories={allCategories}
          shownCount={filteredStops.length}
          totalCount={stops.length}
        />

        <QuizStopsTable
          stops={filteredStops}
          deletingId={deletingId}
          onDelete={handleDelete}
          onShowOnMap={handleShowOnMap}
          getStatus={getStatus}
        />
      </div>

      <DeleteConfirmationDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}
        onConfirm={deleteDialog.onConfirm}
        title="Usunąć Quiz Stop?"
        description="Ten punkt zniknie z mapy graczy. Tej operacji nie można cofnąć."
      />
    </div>
  );
}
