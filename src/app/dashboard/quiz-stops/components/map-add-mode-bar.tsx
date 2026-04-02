"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MousePointerClick } from "lucide-react";
import type { QuizStopType } from "@/types";

type AddMode = QuizStopType | null;

interface MapAddModeBarProps {
  addMode: AddMode;
  onModeChange: (mode: AddMode) => void;
}

export function MapAddModeBar({ addMode, onModeChange }: MapAddModeBarProps) {
  return (
    <Card
      className={`border transition-colors ${
        addMode ? "border-amber-400 bg-amber-50 shadow-md" : "border-slate-200"
      }`}
    >
      <CardContent className="py-3 px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <MousePointerClick className="w-5 h-5 text-amber-500" />
          Tryb dodawania punktów:
        </div>
        <div className="flex gap-2">
          <Button
            variant={addMode === null ? "default" : "outline"}
            onClick={() => onModeChange(null)}
            className={addMode === null ? "bg-slate-800" : "bg-white"}
          >
            Wyłączony
          </Button>
          <Button
            variant={addMode === "normal" ? "default" : "outline"}
            onClick={() => onModeChange("normal")}
            className={
              addMode === "normal"
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-white"
            }
          >
            Normalny
          </Button>
          <Button
            variant={addMode === "premium" ? "default" : "outline"}
            onClick={() => onModeChange("premium")}
            className={
              addMode === "premium"
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : "bg-white"
            }
          >
            Premium
          </Button>
        </div>
        {addMode && (
          <div className="text-xs font-medium text-amber-600 animate-pulse bg-amber-100 px-3 py-1 rounded-full border border-amber-200">
            Klikaj na mapie aby dodać punkt
          </div>
        )}
      </CardContent>
    </Card>
  );
}
