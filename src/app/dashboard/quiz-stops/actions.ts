"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface QuizStop {
  id: string;
  type: string; // 'normal' | 'premium'
  categories: string[];
  location: string; // PostGIS POINT format: 'POINT(lng lat)'
  coin_budget: number;
  expires_at: string;
  created_at: string;
}

export async function getQuizStops(): Promise<QuizStop[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quiz_stops")
    .select("id, type, categories, location, coin_budget, expires_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching quiz stops:", error);
    return [];
  }

  console.log(`[getQuizStops] Server found ${data?.length ?? 0} records in database`);
  return data ?? [];
}

export async function createQuizStop(
  lat: number,
  lng: number,
  type: string
): Promise<{ success: boolean; error?: string; data?: QuizStop }> {
  const supabase = await createClient();

  const locationPoint = `POINT(${lng} ${lat})`;
  const coinBudget = 20;

  const expiresAtDate = new Date();
  expiresAtDate.setHours(expiresAtDate.getHours() + 24);
  const expiresAtStr = expiresAtDate.toISOString();

  let categories: string[] = [];
  if (type === "normal") {
    const { data: catData } = await supabase
      .from("categories")
      .select("name");
      
    if (catData && catData.length > 0) {
      const shuffled = catData.sort(() => 0.5 - Math.random());
      categories = shuffled.slice(0, 3).map(c => c.name);
    } else {
      categories = ["Ogólne"]; // Fallback if no categories in DB yet
    }
  }

  const { data, error } = await supabase.from("quiz_stops").insert({
    type,
    categories,
    location: locationPoint,
    coin_budget: coinBudget,
    expires_at: expiresAtStr,
  }).select().single();

  if (error) {
    console.error("Error creating quiz stop:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/quiz-stops");
  return { success: true, data: data as QuizStop };
}

export async function deleteQuizStop(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.from("quiz_stops").delete().eq("id", id);

  if (error) {
    console.error("Error deleting quiz stop:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/quiz-stops");
  return { success: true };
}
