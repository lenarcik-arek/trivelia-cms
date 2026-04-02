"use client";

import { useState, useMemo } from "react";
import { 
  Category, 
  Question, 
  createCategory, 
  deleteCategory, 
  createQuestion, 
  deleteQuestion 
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  Trash2, 
  Plus, 
  Loader2, 
  ChevronRight, 
  HelpCircle, 
  LayoutGrid, 
  Home 
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { 
  DeleteConfirmationDialog, 
  isDeleteConfirmationRequired 
} from "@/components/dashboard/delete-confirmation-dialog";

interface QuizContentClientProps {
  initialCategories: Category[];
  initialQuestions: Question[];
}

export default function QuizContentClient({ 
  initialCategories, 
  initialQuestions 
}: QuizContentClientProps) {
  // Navigation state
  const [view, setView] = useState<"categories" | "questions">("categories");
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  // Data state
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // --- Deletion Confirmation State ---
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

  // --- Category Form State ---
  const [newCategoryName, setNewCategoryName] = useState("");

  // --- Question Form State ---
  const [questionText, setQuestionText] = useState("");
  const [answers, setAnswers] = useState([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
  ]);

  // --- Derived ---
  const filteredQuestions = useMemo(() => {
    if (!selectedCategory) return [];
    return questions.filter(q => q.category_name === selectedCategory.name);
  }, [questions, selectedCategory]);

  // --- Categories Actions ---
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

  // --- Questions Actions ---
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory || !questionText.trim()) return;
    
    if (answers.length < 2) {
      toast.error("Pytanie musi mieć co najmniej 2 odpowiedzi.");
      return;
    }
    if (answers.filter(a => a.isCorrect).length !== 1) {
      toast.error("Zaznacz dokładnie jedną poprawną odpowiedź.");
      return;
    }
    if (answers.some(a => !a.text.trim())) {
      toast.error("Wszystkie odpowiedzi muszą mieć treść.");
      return;
    }

    setLoading(true);
    const result = await createQuestion(selectedCategory.name, questionText.trim(), answers);
    setLoading(false);

    if (result.success && result.data) {
      setQuestions((prev) => [result.data!, ...prev]);
      setQuestionText("");
      setAnswers([
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
      ]);
      toast.success("Pytanie zostało dodane.");
    } else {
      toast.error("Błąd: " + result.error);
    }
  };

  const deleteQuestionFinal = async (id: string) => {
    setDeletingId(id);
    const result = await deleteQuestion(id);
    setDeletingId(null);

    if (result.success) {
      setQuestions((prev) => prev.filter((q) => q.id !== id));
      toast.success("Pytanie usunięte.");
    } else {
      toast.error("Błąd: " + result.error);
    }
  };

  const handleDeleteQuestion = (id: string) => {
    const action = () => deleteQuestionFinal(id);
    if (!isDeleteConfirmationRequired()) {
      action();
      return;
    }
    setDeleteDialog({
      open: true,
      title: "Usunąć to pytanie?",
      description: "Pytanie zostanie trwale usunięte z bazy danych quizów.",
      onConfirm: action,
    });
  };

  const updateAnswer = (index: number, val: string) => {
    setAnswers((prev) => prev.map((a, i) => (i === index ? { ...a, text: val } : a)));
  };

  const setCorrect = (index: number) => {
    setAnswers((prev) => prev.map((a, i) => ({ ...a, isCorrect: i === index })));
  };

  const addAnswerBlock = () => {
    if (answers.length < 4) {
      setAnswers((prev) => [...prev, { text: "", isCorrect: false }]);
    }
  };

  const removeAnswerBlock = (index: number) => {
    if (answers.length > 2) {
      setAnswers((prev) => {
        const next = prev.filter((_, i) => i !== index);
        if (prev[index].isCorrect && next.length > 0) {
          next[0] = { ...next[0], isCorrect: true };
        }
        return next;
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 font-medium">
        <Link href="/dashboard" className="hover:text-blue-600 flex items-center gap-1">
          <Home className="h-4 w-4" />
          Home
        </Link>
        <ChevronRight className="h-4 w-4 text-slate-300" />
        <button 
          onClick={() => setView("categories")}
          className={`hover:text-blue-600 ${view === 'categories' ? 'text-slate-900 font-bold' : ''}`}
        >
          Kategorie
        </button>
        {view === "questions" && selectedCategory && (
          <>
            <ChevronRight className="h-4 w-4 text-slate-300" />
            <span className="text-slate-900 font-bold">{selectedCategory.name}</span>
          </>
        )}
      </nav>

      {/* Dynamic Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {view === "categories" ? "Kategorie zwykłe" : `Kategoria: ${selectedCategory?.name}`}
        </h1>
      </div>

      {/* --- View 1: CATEGORIES (3-Column Grid) --- */}
      {view === "categories" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Add Form (Top full width on small, Sidebar on med if we want, but user said 3 cols grid for categories) */}
          {/* Actually, let's put the Add Form as the first tile in the grid or as a top bar */}
          <Card className="lg:col-span-1 border-dashed border-2 bg-slate-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-600" />
                Dodaj kategorię
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddCategory} className="flex gap-2">
                <Input
                  className="bg-white"
                  placeholder="Nazwa..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  required
                />
                <Button type="submit" size="sm" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin h-4 w-4" /> : <Plus className="h-4 w-4" />}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Categories Grid (remaining space or separate block) */}
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {categories.map((c) => (
              <div
                key={c.id}
                className="group relative flex flex-col p-5 border rounded-2xl bg-white hover:border-blue-300 hover:shadow-lg transition-all cursor-pointer"
                onClick={() => {
                  setSelectedCategory(c);
                  setView("questions");
                }}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-xl bg-slate-50 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                    <LayoutGrid className="h-6 w-6" />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCategory(c.id, c.name);
                    }}
                    disabled={deletingId === c.id}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <h3 className="font-bold text-xl text-slate-800">{c.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {questions.filter(q => q.category_name === c.name).length} Quizów
                  </p>
                </div>
                <div className="mt-4 flex items-center text-sm font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  Zarządzaj quizami
                  <ChevronRight className="h-4 w-4 ml-1" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- View 2: QUESTIONS (1-Column List, Add Form on top) --- */}
      {view === "questions" && selectedCategory && (
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Add form full width at top */}
          <Card className="border-blue-100 bg-blue-50/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-600" />
                Nowy Quiz / Pytanie
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddQuestion} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-slate-600">Treść pytania</Label>
                    <Input
                      className="bg-white border-slate-200"
                      placeholder="Wpisz treść..."
                      value={questionText}
                      onChange={(e) => setQuestionText(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <Label className="text-slate-600">Odpowiedzi</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addAnswerBlock}
                        disabled={answers.length >= 4}
                        className="h-7 text-xs bg-white"
                      >
                        + Dodaj opcję
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {answers.map((ans, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 p-2 rounded-lg border bg-white ${
                            ans.isCorrect ? "border-green-300 ring-1 ring-green-100" : "border-slate-200"
                          }`}
                        >
                          <input
                            type="radio"
                            checked={ans.isCorrect}
                            onChange={() => setCorrect(idx)}
                            className="w-4 h-4 text-green-600 focus:ring-green-500"
                          />
                          <Input
                            className="h-8 border-none focus-visible:ring-0 px-1"
                            placeholder={`Odpowiedź ${idx+1}`}
                            value={ans.text}
                            onChange={(e) => updateAnswer(idx, e.target.value)}
                            required
                          />
                          {answers.length > 2 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-300 hover:text-red-500"
                              onClick={() => removeAnswerBlock(idx)}
                            >
                              &times;
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin mr-2" /> : <Plus className="mr-2 h-4 w-4" />}
                  {loading ? "Zapisywanie..." : "Dodaj pytanie do bazy"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* List full width below */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-slate-400" />
              Lista pytań ({filteredQuestions.length})
            </h2>
            {filteredQuestions.length === 0 ? (
              <div className="text-center py-20 border-2 border-dashed rounded-3xl text-slate-400 bg-white">
                Brak pytań w tej kategorii. Wykorzystaj formularz powyżej, aby dodać pierwsze.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredQuestions.map((q) => (
                  <Card key={q.id} className="overflow-hidden border-slate-200">
                    <CardContent className="p-0">
                      <div className="p-5 flex justify-between items-start bg-white">
                        <div className="flex-1 pr-10">
                          <h3 className="font-bold text-lg text-slate-900 leading-tight">{q.text}</h3>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-slate-300 hover:text-red-500 hover:bg-red-50"
                          onClick={() => handleDeleteQuestion(q.id)}
                          disabled={deletingId === q.id}
                        >
                          {deletingId === q.id ? <Loader2 className="animate-spin h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-5 pt-0 bg-slate-50/50">
                        {q.answers.map((a, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 p-3 text-sm rounded-xl border ${
                              a.isCorrect
                                ? "bg-green-100 border-green-200 text-green-900 font-bold"
                                : "bg-white border-slate-100 text-slate-600"
                            }`}
                          >
                            <span className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] ${
                              a.isCorrect ? "bg-green-600 text-white" : "bg-slate-100 text-slate-400"
                            }`}>
                              {idx + 1}
                            </span>
                            {a.text}
                            {a.isCorrect && <span className="ml-auto text-green-600">Poprawna</span>}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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

