"use client";

import { Button } from "@/components/ui/button";

interface QuizStopsFiltersProps {
  filterStatus: string;
  onFilterStatusChange: (val: string) => void;
  filterType: string;
  onFilterTypeChange: (val: string) => void;
  filterCategory: string;
  onFilterCategoryChange: (val: string) => void;
  sortField: "created_at" | "expires_at";
  onSortFieldChange: (val: "created_at" | "expires_at") => void;
  sortOrder: "asc" | "desc";
  onSortOrderChange: () => void;
  allCategories: string[];
  shownCount: number;
  totalCount: number;
}

const selectClass =
  "flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-slate-400";

export function QuizStopsFilters({
  filterStatus,
  onFilterStatusChange,
  filterType,
  onFilterTypeChange,
  filterCategory,
  onFilterCategoryChange,
  sortField,
  onSortFieldChange,
  sortOrder,
  onSortOrderChange,
  allCategories,
  shownCount,
  totalCount,
}: QuizStopsFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3 items-end bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500">Status</label>
        <select
          className={selectClass}
          value={filterStatus}
          onChange={(e) => onFilterStatusChange(e.target.value)}
        >
          <option value="all">Wszystkie statusy</option>
          <option value="active">Aktywne</option>
          <option value="inactive">Nieaktywne</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500">Typ</label>
        <select
          className={selectClass}
          value={filterType}
          onChange={(e) => onFilterTypeChange(e.target.value)}
        >
          <option value="all">Wszystkie typy</option>
          <option value="normal">Normalny</option>
          <option value="premium">Premium</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500">Kategoria</label>
        <select
          className={selectClass}
          value={filterCategory}
          onChange={(e) => onFilterCategoryChange(e.target.value)}
        >
          <option value="all">Wszystkie kategorie</option>
          {allCategories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5 min-w-[200px]">
        <label className="text-xs font-semibold text-slate-500">Sortuj według</label>
        <div className="flex gap-1">
          <select
            className={selectClass}
            value={sortField}
            onChange={(e) =>
              onSortFieldChange(e.target.value as "created_at" | "expires_at")
            }
          >
            <option value="created_at">Daty dodania</option>
            <option value="expires_at">Daty wygaśnięcia</option>
          </select>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={onSortOrderChange}
          >
            {sortOrder === "asc" ? "↑" : "↓"}
          </Button>
        </div>
      </div>

      <div className="ml-auto pb-1 text-xs text-slate-400 font-medium">
        Pokazano {shownCount} z {totalCount} punktów
      </div>
    </div>
  );
}
