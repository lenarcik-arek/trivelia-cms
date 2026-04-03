"use client";

import { useState } from "react";
import { 
  Category, 
  Question, 
  createQuestion, 
  deleteQuestion,
  deleteCategory 
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Trash2, 
  Plus, 
  Loader2, 
  HelpCircle,
  XCircle,
  ArrowLeft
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { 
  DeleteConfirmationDialog, 
  isDeleteConfirmationRequired 
} from "@/components/dashboard/delete-confirmation-dialog";

interface QuestionsListProps {
  category: Category;
  questions: Question[];
}

export function QuestionsList({ 
  category, 
  questions: initialQuestions 
}: QuestionsListProps) {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
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

  // --- Question Form State ---
  const [questionText, setQuestionText] = useState("");
  const [answers, setAnswers] = useState([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false },
  ]);

  // --- Category Deletion ---
  const handleDeleteCategory = () => {
    const action = async () => {
      setLoading(true);
      const result = await deleteCategory(category.id);
      setLoading(false);
      if (result.success) {
        toast.success("Kategoria została usunięta.");
        router.push("/dashboard/quiz-content");
      } else {
        toast.error("Błąd: " + result.error);
      }
    };

    if (!isDeleteConfirmationRequired()) {
      action();
      return;
    }
    setDeleteDialog({
      open: true,
      title: `Usunąć kategorię "${category.name}"?`,
      description: "Usunięcie kategorii spowoduje, że przypisane do niej pytania stracą swoją kategorię główną.",
      onConfirm: action,
    });
  };

  // --- Questions Actions ---
  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;
    
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
    const result = await createQuestion(category.name, questionText.trim(), answers);
    setLoading(false);

    if (result.success && result.data) {
      setQuestions((prev) => [result.data!, ...prev]);
      setQuestionText("");
      setAnswers([
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
      ]);
      toast.success("Quiz został dodany.");
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
      toast.success("Quiz usunięty.");
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
      title: "Usunąć ten Quiz?",
      description: "Quiz zostanie trwale usunięty z bazy danych.",
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
    <div className="space-y-8 max-w-5xl mx-auto py-2">
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-4">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="text-slate-500 font-medium">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Powrót
        </Button>
        
        {/* 5. Delete Button in Top Right */}
        <Button 
          variant="destructive" 
          size="sm" 
          className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border-none shadow-none font-semibold h-9 px-4"
          onClick={handleDeleteCategory}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Usuń kategorię
        </Button>
      </div>

      {/* 7. Redesign Question Component: Wide, Question on top, 2 cols answers */}
      <Card className="border-blue-100 bg-blue-50/20 overflow-hidden shadow-sm">
        <CardContent className="p-8">
          <form onSubmit={handleAddQuestion} className="space-y-8">
            <div className="space-y-2">
              <Label className="text-slate-600 font-bold uppercase tracking-wider text-[10px]">Treść pytania</Label>
              <Input
                className="bg-white border-slate-200 h-14 text-lg font-bold placeholder:text-slate-300 px-6 rounded-2xl"
                placeholder="Wpisz treść pytania..."
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                required
              />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-slate-600 font-bold uppercase tracking-wider text-[10px]">Warianty odpowiedzi</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addAnswerBlock}
                  disabled={answers.length >= 4}
                  className="h-7 text-xs text-blue-600 hover:bg-blue-100"
                >
                  + Dodaj opcję
                </Button>
              </div>

              {/* 2nd column responses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {answers.map((ans, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-1 rounded-2xl border bg-white transition-all ${
                      ans.isCorrect ? "border-green-400 ring-4 ring-green-50 shadow-sm" : "border-slate-200"
                    }`}
                  >
                     <div 
                      onClick={() => setCorrect(idx)}
                      className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center cursor-pointer transition-all ${
                        ans.isCorrect ? "bg-green-500 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                      }`}
                     >
                        {ans.isCorrect ? <Plus className="w-5 h-5 rotate-45" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                     </div>
                    
                    <Input
                      className="h-10 border-none focus-visible:ring-0 px-1 font-medium bg-transparent"
                      placeholder={`Opcja ${idx+1}`}
                      value={ans.text}
                      onChange={(e) => updateAnswer(idx, e.target.value)}
                      required
                    />
                    
                    {answers.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-300 hover:text-red-500 rounded-xl"
                        onClick={() => removeAnswerBlock(idx)}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center">
               {/* 7. Button + Dodaj Quiz */}
              <Button type="submit" className="px-10 h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 font-bold shadow-lg shadow-blue-200" disabled={loading}>
                {loading ? <Loader2 className="animate-spin mr-2" /> : <Plus className="mr-2 h-5 w-5" />}
                {loading ? "Zapisywanie..." : "+ Dodaj Quiz"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* List matches the add form width (already did max-w-5xl) */}
      <div className="space-y-6">
        <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">Wszystkie Quizy w tej kategorii</h2>
            <div className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">
              {questions.length}
            </div>
        </div>

        {questions.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed rounded-[32px] text-slate-400 bg-white">
            Brak pytań w tej kategorii. Wykorzystaj formularz powyżej, aby dodać pierwsze.
          </div>
        ) : (
          <div className="space-y-6">
            {questions.map((q) => (
              <Card key={q.id} className="overflow-hidden border-slate-200 rounded-[32px] shadow-sm">
                <CardContent className="p-0">
                  <div className="p-8 pb-5 flex justify-between items-start bg-white">
                    <div className="flex-1 pr-10">
                      <div className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mb-2">Treść Quizu</div>
                      <h3 className="font-bold text-xl text-slate-900 leading-tight">{q.text}</h3>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl h-10 w-10"
                      onClick={() => handleDeleteQuestion(q.id)}
                      disabled={deletingId === q.id}
                    >
                      {deletingId === q.id ? <Loader2 className="animate-spin h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
                    </Button>
                  </div>
                  {/* Matching layout: 2 columns for answers */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-8 pt-0 bg-white">
                    {q.answers.map((a, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-4 p-3 pr-5 text-sm rounded-2xl border transition-all ${
                          a.isCorrect
                            ? "bg-green-50 border-green-200 text-green-900 shadow-sm"
                            : "bg-slate-50 border-slate-100 text-slate-600"
                        }`}
                      >
                        <div className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-bold transition-all ${
                          a.isCorrect ? "bg-green-600 text-white" : "bg-slate-200 text-slate-500"
                        }`}>
                          {idx + 1}
                        </div>
                        <span className="font-medium">{a.text}</span>
                        {a.isCorrect && <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-green-600">Poprawna</span>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

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
