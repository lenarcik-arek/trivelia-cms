export default function Page() {
  const titles: Record<string, string> = {
    "quiz-stops": "Quiz Stopy",
    "questions": "Pytania",
    "categories": "Kategorie",
    "users": "Użytkownicy",
  };
  const title = titles["users"] || "users";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <p className="text-slate-500 mt-1">Ta sekcja jest w trakcie budowy.</p>
      </div>
      <div className="flex items-center justify-center h-64 rounded-xl border-2 border-dashed border-slate-300 bg-slate-100">
        <p className="text-slate-400 text-lg">🚧 Wkrótce dostępne</p>
      </div>
    </div>
  );
}
