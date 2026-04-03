export default function Page() {
  const titles: Record<string, string> = {
    "quiz-stops": "Quiz Stopy",
    "questions": "Pytania",
    "categories": "Kategorie",
    "users": "Użytkownicy",
  };
  const title = titles["users"] || "users";

  return (
    <div className="space-y-6 pt-2">
      <div className="flex items-center justify-center h-64 rounded-xl border-2 border-dashed border-slate-300 bg-white">
        <p className="text-slate-400 text-lg">🚧 Wkrótce dostępne</p>
      </div>
    </div>
  );
}
