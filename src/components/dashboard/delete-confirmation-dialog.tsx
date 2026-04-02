"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";

const SNOOZE_KEY = "trivelia_delete_snooze_until";
const SNOOZE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export interface DeleteConfirmationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
  title?: string;
  description?: string;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Czy na pewno chcesz usunąć ten element?",
  description = "Tej operacji nie można cofnąć. Element zostanie trwale usunięty z bazy danych.",
}: DeleteConfirmationProps) {
  const [snoozeChecked, setSnoozeChecked] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (snoozeChecked) {
      const until = Date.now() + SNOOZE_DURATION_MS;
      localStorage.setItem(SNOOZE_KEY, until.toString());
    }
    
    setIsDeleting(true);
    await onConfirm();
    setIsDeleting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] border-none shadow-2xl p-0 overflow-hidden">
        <div className="bg-red-50 p-6 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <Trash2 className="h-7 w-7 text-red-600" />
          </div>
          <DialogTitle className="text-xl font-bold text-red-900 mb-1">{title}</DialogTitle>
          <DialogDescription className="text-red-700/80 max-w-[280px]">
            {description}
          </DialogDescription>
        </div>

        <div className="p-6 pt-2 space-y-6">
          <div className="flex items-center space-x-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
            <Checkbox 
              id="snooze" 
              checked={snoozeChecked} 
              onCheckedChange={(checked) => setSnoozeChecked(!!checked)}
            />
            <Label 
              htmlFor="snooze" 
              className="text-sm font-medium text-slate-600 cursor-pointer leading-tight"
            >
              Nie pokazuj mi tego przez kolejne 5 min
            </Label>
          </div>

          <DialogFooter className="flex sm:flex-row gap-3">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="flex-1 text-slate-500 hover:text-slate-900"
              disabled={isDeleting}
            >
              Anuluj
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              className="flex-1 bg-red-600 hover:bg-red-700 shadow-md shadow-red-200"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {isDeleting ? "Usuwanie..." : "Tak, usuń"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Utility to check if confirmation is required
export function isDeleteConfirmationRequired(): boolean {
  if (typeof window === "undefined") return true;
  const snoozedUntilStr = localStorage.getItem(SNOOZE_KEY);
  if (!snoozedUntilStr) return true;
  
  const snoozedUntil = parseInt(snoozedUntilStr, 10);
  if (isNaN(snoozedUntil)) return true;
  
  return Date.now() > snoozedUntil;
}
