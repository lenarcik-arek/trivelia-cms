"use client";

import { useState } from "react";
import { Question, createQuestion, deleteQuestion } from "./actions";
import { Category } from "../categories/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, Plus, Loader2 } from "lucide-react";

interface QuestionsClientProps {
  initialQuestions: Question[];
  categories: Category[];
}

export default function QuestionsClient({ initialQuestions, categories }: QuestionsClientProps) {
  const [questions, setQuestions] = useState<Question[]>(initialQuestions);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [categoryName, setCategoryName] = useState(categories[0]?.name || "");
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState([
    { text: "", isCorrect: true },
    { text: "", isCorrect: false }
  ]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !categoryName) return;
    if (answers.length < 2 || answers.length > 4) {
      alert("Pytanie musi mieć od 2 do 4 odpowiedzi.");
      return;
    }
    if (answers.filter(a => a.isCorrect).length !== 1) {
      alert("Dokładnie jedna odpowiedź musi być prawidłowa.");
      return;
    }
    for (const a of answers) {
      if (!a.text.trim()) {
        alert("Wszystkie odpowiedzi muszą mieć treść.");
        return;
      }
    }

    setLoading(true);
    const result = await createQuestion(categoryName, text.trim(), answers);
    setLoading(false);

    if (result.success) {
      setText("");
      setAnswers([{ text: "", isCorrect: true }, { text: "", isCorrect: false }]);
      window.location.reload();
    } else {
      alert("Błąd: " + result.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć to pytanie?")) return;
    setDeletingId(id);
    const result = await deleteQuestion(id);
    if (result.success) {
      setQuestions(prev => prev.filter(q => q.id !== id));
    } else {
      alert("Błąd: " + result.error);
    }
    setDeletingId(null);
  };

  const updateAnswer = (index: number, val: string) => {
    const newAnswers = [...answers];
    newAnswers[index].text = val;
    setAnswers(newAnswers);
  };

  const setCorrect = (index: number) => {
    const newAnswers = answers.map((a, i) => ({
      ...a,
      isCorrect: i === index
    }));
    setAnswers(newAnswers);
  };

  const addAnswerBlock = () => {
    if (answers.length < 4) {
      setAnswers([...answers, { text: "", isCorrect: false }]);
    }
  };

  const removeAnswerBlock = (index: number) => {
    if (answers.length > 2) {
      const newAnswers = answers.filter((_, i) => i !== index);
      // Ensure there is still one correct answer
      if (answers[index].isCorrect && newAnswers.length > 0) {
        newAnswers[0].isCorrect = true; 
      }
      setAnswers(newAnswers);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pytania do Quizów</h1>
          <p className="text-muted-foreground mt-1">
            Dodawaj pytania (z 1 poprawną i opcjonalnie 1-3 fałszywymi odpowiedziami) i przypisuj je do kategorii.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Lewa: Formularz */}
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dodaj pytanie</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Wybierz Kategorię</Label>
                  {categories.length === 0 ? (
                    <p className="text-sm text-red-500">Najpierw dodaj jakąś kategorię!</p>
                  ) : (
                    <select 
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={categoryName}
                      onChange={(e) => setCategoryName(e.target.value)}
                      required
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Treść pytania</Label>
                  <Input 
                    placeholder="Wpisz treść pytania..."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center">
                    <Label>Możliwe odpowiedzi</Label>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={addAnswerBlock} 
                      disabled={answers.length >= 4}
                      size="sm"
                      className="h-7 text-xs"
                    >
                      + Opcja
                    </Button>
                  </div>
                  
                  {answers.map((ans, idx) => (
                    <div key={idx} className={`flex items-center gap-2 p-2 rounded-md border ${ans.isCorrect ? 'bg-green-50/50 border-green-200' : 'bg-slate-50'}`}>
                      <input 
                        type="radio" 
                        name="correctAnswer" 
                        checked={ans.isCorrect}
                        onChange={() => setCorrect(idx)}
                        className="w-4 h-4 text-green-600 focus:ring-green-500"
                      />
                      <Input
                        className="h-8"
                        placeholder={`Odpowiedź ${idx + 1}...`}
                        value={ans.text}
                        onChange={(e) => updateAnswer(idx, e.target.value)}
                        required
                      />
                      {answers.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAnswerBlock(idx)}
                          className="h-8 w-8 text-slate-400 hover:text-red-500"
                        >
                          &times;
                        </Button>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-slate-500">Zaznacz opcję, która jest poprawna.</p>
                </div>

                <Button 
                  type="submit" 
                  className="w-full mt-4"
                  disabled={loading || categories.length === 0}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  {loading ? "Zapisywanie..." : "Dodaj pytanie"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Prawa: Lista */}
        <div className="md:col-span-2">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">Baza pytań</CardTitle>
              <CardDescription>
                Lista dostępnych pytań, które będą losowane w grze mobilnej dla poszczególnych kategorii.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {questions.length === 0 ? (
                <div className="text-center py-10 text-slate-500 border-2 border-dashed rounded-lg">
                  <p>Brak pytań.</p>
                  <p className="text-sm mt-1">Stwórz nową tabelę w DB i dodaj pierwsze pytania.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {questions.map((q) => (
                    <div key={q.id} className="p-4 border rounded-lg bg-white relative">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full mb-2">
                            {q.category_name}
                          </span>
                          <h3 className="font-semibold text-slate-800">{q.text}</h3>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-slate-400 hover:text-red-500 absolute top-2 right-2"
                          onClick={() => handleDelete(q.id)}
                          disabled={deletingId === q.id}
                        >
                          {deletingId === q.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                        {q.answers.map((a, idx) => (
                          <div key={idx} className={`p-2 text-sm rounded ${a.isCorrect ? 'bg-green-100/50 border border-green-200 text-green-900 font-medium' : 'bg-slate-50 text-slate-600'}`}>
                            {a.text} {a.isCorrect && "✓"}
                          </div>
                        ))}
                      </div>
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
