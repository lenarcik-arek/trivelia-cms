"use client";

import { useState } from "react";
import { 
  Category, 
  Question, 
  createCategory, 
  deleteCategory 
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Trash2, 
  Plus, 
  Loader2, 
  LayoutGrid, 
  ChevronRight,
  Eye
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { 
  DeleteConfirmationDialog, 
  isDeleteConfirmationRequired 
} from "@/components/dashboard/delete-confirmation-dialog";

interface CategoriesGridProps {
  categories: Category[];
  questions: Question[];
}

export function CategoriesGrid({ 
  categories: initialCategories, 
  questions 
}: CategoriesGridProps) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => Promise<void> | void;
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setLoading(true);
    const result = await createCategory(newCategoryName.trim());
    setLoading(false);

    if (result.success && result.data) {
      setCategories((prev) => [result.data!, ...prev]);
      setNewCategoryName("");
      toast.success("Kategoria dodana.");
    } else {
      toast.error("Błąd: " + result.error);
    }
  };

  const deleteCategoryFinal = async (id: string) => {
    setDeletingId(id);
    const result = await deleteCategory(id);
    setDeletingId(null);

    if (result.success) {
      setCategories((prev) => prev.filter((c) => c.id !== id));
      toast.success("Kategoria usunięta.");
    } else {
      toast.error("Błąd: " + result.error);
    }
  };

  const handleDeleteCategory = (id: string, name: string) => {
    const action = () => deleteCategoryFinal(id);
    if (!isDeleteConfirmationRequired()) {
      action();
      return;
    }
    setDeleteDialog({
      open: true,
      title: `Usunąć kategorię "${name}"?`,
      description: "Usunięcie kategorii spowoduje, że przypisane do niej pytania stracą swoją kategorię główną.",
      onConfirm: action,
    });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* 3. Add Category as First Tile */}
      <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/30 flex flex-col justify-center gap-4">
        <div className="flex items-center gap-2 text-slate-600 font-semibold mb-1">
          <Plus className="h-5 w-5 text-blue-600" />
          Dodaj kategorię
        </div>
        <form onSubmit={handleAddCategory} className="flex gap-2">
          <Input
            className="bg-white border-slate-200"
            placeholder="Nazwa..."
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            required
          />
          <Button type="submit" size="sm" disabled={loading} className="shrink-0">
            {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </Button>
        </form>
      </div>

      {/* 2. Redesign Categories Tiles */}
      {categories.map((c) => (
        <Link
          key={c.id}
          href={`/dashboard/quiz-content/${encodeURIComponent(c.name)}`}
          className="group relative flex flex-col p-5 border border-slate-200 rounded-2xl bg-white hover:border-blue-400 hover:shadow-md transition-all h-full"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-slate-50 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
              <LayoutGrid className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-lg text-slate-800">{c.name}</h3>
              <p className="text-sm text-slate-500">
                {questions.filter(q => q.category_name === c.name).length} Quizów
              </p>
            </div>
            
            {/* Delete button visible on mobile (4. Fix) */}
            {/* On mobile, we can also use group-hover but user wants it visible on mobile specifically. */}
            {/* Usually on mobile, we don't have hover. So opacity-100 on < lg */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteCategory(c.id, c.name);
              }}
              disabled={deletingId === c.id}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-auto flex justify-end pt-4">
             {/* 2. Button in bottom right */}
             <div className="flex items-center text-xs font-semibold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all pointer-events-none">
                Podgląd kategorii
                <Eye className="h-3 w-3 ml-2" />
             </div>
          </div>
        </Link>
      ))}

      <DeleteConfirmationDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog(prev => ({ ...prev, open }))}
        onConfirm={deleteDialog.onConfirm}
        title={deleteDialog.title}
        description={deleteDialog.description}
      />
    </div>
  );
}
