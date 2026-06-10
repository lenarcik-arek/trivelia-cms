"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, UploadCloud, FileSpreadsheet, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { bulkImportQuestions } from "../actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ImportQuizModalProps {
  className?: string;
}

export function ImportQuizModal({ className }: ImportQuizModalProps) {
  const [open, setOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (validTypes.includes(selectedFile.type) || selectedFile.name.match(/\.(xls|xlsx)$/i)) {
      setFile(selectedFile);
    } else {
      toast.error("Nieprawidłowy format pliku. Wybierz plik .xls lub .xlsx");
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawData = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });

      const parsedQuestions = [];
      
      // Skip empty rows and the header row if it exists (by checking if row[0] is "Kategoria" etc. but let's just parse what looks like data)
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length < 4) continue; // Category, Question, Correct, Incorrect1 are required

        const category_name = String(row[0] || "").trim();
        const text = String(row[1] || "").trim();
        const correct = String(row[2] || "").trim();
        const incorrect1 = String(row[3] || "").trim();
        const incorrect2 = String(row[4] || "").trim();
        const incorrect3 = String(row[5] || "").trim();

        // Check if this looks like a header row
        if (i === 0 && (category_name.toLowerCase() === "kategoria" || text.toLowerCase() === "treść pytania" || text.toLowerCase() === "pytanie")) {
          continue;
        }

        if (!category_name || !text || !correct || !incorrect1) {
          continue; // Skip invalid rows
        }

        const answers = [
          { text: correct, isCorrect: true },
          { text: incorrect1, isCorrect: false },
        ];
        
        if (incorrect2) answers.push({ text: incorrect2, isCorrect: false });
        if (incorrect3) answers.push({ text: incorrect3, isCorrect: false });

        parsedQuestions.push({
          category_name,
          text,
          answers,
        });
      }

      if (parsedQuestions.length === 0) {
        toast.error("Nie znaleziono prawidłowych pytań w pliku.");
        setLoading(false);
        return;
      }

      const result = await bulkImportQuestions(parsedQuestions);

      if (result.success) {
        toast.success(`Pomyślnie zaimportowano ${parsedQuestions.length} pytań.`);
        setOpen(false);
        setFile(null);
      } else {
        toast.error("Błąd podczas importu: " + result.error);
      }
    } catch (error) {
      console.error(error);
      toast.error("Błąd podczas przetwarzania pliku.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger 
        render={<Button variant="outline" size="sm" className={cn("gap-2", className)} />}
      >
        <Upload className="h-4 w-4" />
        Importuj
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importuj z Excela</DialogTitle>
          <DialogDescription>
            Prześlij plik .xls lub .xlsx ze strukturą:
            <br />Kol A: Kategoria, B: Pytanie, C: Poprawna, D: Błędna 1, E: Błędna 2, F: Błędna 3
          </DialogDescription>
        </DialogHeader>
        
        <div 
          className={cn(
            "mt-4 p-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-4 transition-colors",
            isDragging ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50",
            file ? "bg-green-50/50 border-green-200 hover:bg-green-50/50" : ""
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {file ? (
            <div className="flex flex-col items-center text-center">
              <FileSpreadsheet className="h-10 w-10 text-green-600 mb-2" />
              <p className="font-medium text-slate-800">{file.name}</p>
              <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-4 text-slate-500 hover:text-red-600"
                onClick={() => setFile(null)}
                disabled={loading}
              >
                Usuń plik
              </Button>
            </div>
          ) : (
            <>
              <div className="p-3 bg-blue-100 text-blue-600 rounded-full">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">Przeciągnij i upuść plik tutaj</p>
                <p className="text-xs text-slate-500 mt-1">lub kliknij przycisk poniżej</p>
              </div>
              <Button 
                variant="secondary" 
                onClick={() => fileInputRef.current?.click()}
                className="mt-2"
              >
                Dodaj plik
              </Button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              />
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Anuluj
          </Button>
          <Button onClick={handleImport} disabled={!file || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Importuj
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
