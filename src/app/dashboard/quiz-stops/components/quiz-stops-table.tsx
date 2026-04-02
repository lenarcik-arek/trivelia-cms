"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Eye, Edit } from "lucide-react";
import type { QuizStop } from "../actions";
import type { QuizStopStatus } from "@/types";

interface ParsedStop extends QuizStop {
  lat: number;
  lng: number;
}

interface QuizStopsTableProps {
  stops: ParsedStop[];
  deletingId: string | null;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onShowOnMap: (lat: number, lng: number) => void;
  getStatus: (stop: QuizStop) => QuizStopStatus;
}

export function QuizStopsTable({
  stops,
  deletingId,
  onDelete,
  onShowOnMap,
  getStatus,
}: QuizStopsTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-white">
      <Table>
        <TableHeader className="bg-transparent border-b">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-24 font-bold text-slate-700">Status</TableHead>
            <TableHead className="w-20 font-bold text-slate-700">Typ</TableHead>
            <TableHead className="font-bold text-slate-700">ID (skrót)</TableHead>
            <TableHead className="font-bold text-slate-700">Lokalizacja</TableHead>
            <TableHead className="font-bold text-slate-700 min-w-[200px]">Kategorie</TableHead>
            <TableHead className="font-bold text-slate-700">Monety (akt/pocz)</TableHead>
            <TableHead className="font-bold text-slate-700">Dodano / Wygasa</TableHead>
            <TableHead className="text-right font-bold text-slate-700">Akcje</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stops.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-12 text-slate-400">
                Brak punktów spełniających kryteria filtrowania.
              </TableCell>
            </TableRow>
          ) : (
            stops.map((stop) => {
              const status = getStatus(stop);
              return (
                <TableRow key={stop.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        status === "active"
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : "bg-red-100 text-red-700 border-red-200"
                      }
                    >
                      {status === "active" ? "Aktywny" : "Nieaktywny"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        stop.type === "premium"
                          ? "bg-amber-100 text-amber-700 border-amber-200"
                          : "bg-blue-100 text-blue-700 border-blue-200"
                      }
                    >
                      {stop.type === "premium" ? "PREM" : "NORM"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[10px] text-slate-500">
                    {stop.id.slice(-8).toUpperCase()}
                  </TableCell>
                  <TableCell className="text-[11px] text-slate-600">
                    <div className="flex flex-col">
                      <span className="font-medium">{stop.lat.toFixed(5)}</span>
                      <span>{stop.lng.toFixed(5)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(stop.categories || []).map((c, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="text-[10px] font-normal px-2 py-0 border-slate-200 text-slate-600 whitespace-nowrap"
                        >
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-700">{stop.coin_budget}</span>
                      <span className="text-slate-400">/ 20</span>
                      <span className="text-amber-500">🪙</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-[10px] text-slate-500 leading-tight">
                    <div className="mb-1">
                      <span className="text-slate-400">Dod:</span>{" "}
                      {new Date(stop.created_at).toLocaleDateString()}
                    </div>
                    <div>
                      <span className="text-slate-400">Wyg:</span>{" "}
                      {new Date(stop.expires_at).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Pokaż na mapie"
                        onClick={() => onShowOnMap(stop.lat, stop.lng)}
                        className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Edytuj"
                        disabled
                        className="h-8 w-8 text-slate-400"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Usuń"
                        onClick={(e) => onDelete(e, stop.id)}
                        disabled={deletingId === stop.id}
                        className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
