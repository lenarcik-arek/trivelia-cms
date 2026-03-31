"use client";

import dynamic from "next/dynamic";
import { type QuizStop } from "./actions";

const QuizStopsMap = dynamic(() => import("./quiz-stops-map"), {
  ssr: false,
  loading: () => (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Quiz Stopy</h1>
        <p className="text-slate-500 mt-1">Ładowanie mapy...</p>
      </div>
      <div className="h-[60vh] rounded-xl border border-slate-200 bg-slate-100 animate-pulse flex items-center justify-center">
        <p className="text-slate-400">🗺️ Przygotowywanie mapy...</p>
      </div>
    </div>
  ),
});

export default function QuizStopsMapWrapper({ initialStops }: { initialStops: QuizStop[] }) {
  return <QuizStopsMap initialStops={initialStops} />;
}
