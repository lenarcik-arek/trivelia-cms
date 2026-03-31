import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, HelpCircle, Users, Coins } from "lucide-react";

async function getStats() {
  const supabase = await createClient();

  const [stopsRes, profilesRes] = await Promise.all([
    supabase.from("quiz_stops").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  return {
    quizStops: stopsRes.count ?? 0,
    totalUsers: profilesRes.count ?? 0,
  };
}

export default async function DashboardPage() {
  const stats = await getStats();

  const cards = [
    {
      title: "Quiz Stopy",
      value: stats.quizStops,
      description: "Aktywne punkty na mapie",
      icon: MapPin,
      gradient: "from-blue-500 to-cyan-400",
    },
    {
      title: "Pytania",
      value: "—",
      description: "Wkrótce dostępne",
      icon: HelpCircle,
      gradient: "from-violet-500 to-purple-400",
    },
    {
      title: "Gracze",
      value: stats.totalUsers,
      description: "Zarejestrowani użytkownicy",
      icon: Users,
      gradient: "from-emerald-500 to-teal-400",
    },
    {
      title: "Monety w obiegu",
      value: "—",
      description: "Wkrótce dostępne",
      icon: Coins,
      gradient: "from-amber-500 to-orange-400",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 mt-1">Witaj w panelu zarządzania Trivelia</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">
                {card.title}
              </CardTitle>
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${card.gradient} flex items-center justify-center`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-slate-800">{card.value}</p>
              <p className="text-xs text-slate-400 mt-1">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
