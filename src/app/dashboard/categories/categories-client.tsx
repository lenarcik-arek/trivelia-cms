"use client";

import { useState } from "react";
import { Category, createCategory, deleteCategory } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Loader2 } from "lucide-react";

interface CategoriesClientProps {
  initialCategories: Category[];
}

export default function CategoriesClient({ initialCategories }: CategoriesClientProps) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setLoading(true);
    const result = await createCategory(newCategoryName.trim(), "normal");
    setLoading(false);

    if (result.success) {
      setNewCategoryName("");
      // Real refresh will happen due to revalidatePath
      // But we can do optimistic update if we fetch from server or just wait
      window.location.reload(); 
    } else {
      alert("Błąd podczas dodawania kategorii: " + result.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć tę kategorię?")) return;
    
    setDeletingId(id);
    const result = await deleteCategory(id);
    
    if (result.success) {
      setCategories(prev => prev.filter(c => c.id !== id));
    } else {
      alert("Błąd podczas usuwania: " + result.error);
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Kategorie</h1>
          <p className="text-muted-foreground mt-1">
            Zarządzaj kategoriami przypisywanymi do Quiz Stopów typu Normal.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Kolumna lewa: Dodawanie */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dodaj kategorię</CardTitle>
              <CardDescription>
                Nowa kategoria z której będą losowane tematy na mapie
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nazwa kategorii</Label>
                  <Input 
                    id="name" 
                    placeholder="np. Historia, Kultura..." 
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={loading || !newCategoryName.trim()}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  {loading ? "Zapisywanie..." : "Dodaj"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Kolumna prawa: Lista */}
        <div className="md:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">Dostępne Kategorie (Normal)</CardTitle>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <div className="text-center py-10 text-slate-500 border-2 border-dashed rounded-lg">
                  <p>Brak dodanych kategorii.</p>
                  <p className="text-sm mt-1">Dodaj pierwszą kategorię w panelu obok, aby móc z niej korzystać lub stwórz tabelę w bazie by umożliwić zapis.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {categories.map((category) => (
                    <div 
                      key={category.id} 
                      className="flex items-center justify-between p-3 border rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors"
                    >
                      <span className="font-medium text-slate-700">{category.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                        onClick={() => handleDelete(category.id)}
                        disabled={deletingId === category.id}
                      >
                        {deletingId === category.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
