"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { DEFAULT_COIN_BUDGET, DEFAULT_EXPIRY_HOURS } from "@/lib/constants";
import type { ActionResult } from "@/types";

export interface QuizStop {
  id: string;
  type: string;
  categories: string[];
  location: any;
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

  return (data as QuizStop[]) ?? [];
}

export async function createQuizStop(
  lat: number,
  lng: number,
  type: string
): Promise<ActionResult<QuizStop>> {
  const supabase = await createClient();

  const locationPoint = `POINT(${lng} ${lat})`;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + DEFAULT_EXPIRY_HOURS);

  let categories: string[] = [];
  if (type === "normal") {
    const { data: catData } = await supabase.from("categories").select("name");
    if (catData && catData.length > 0) {
      const shuffled = catData.sort(() => 0.5 - Math.random());
      categories = shuffled.slice(0, 3).map((c) => c.name);
    } else {
      categories = ["Ogólne"];
    }
  }

  const { data, error } = await supabase
    .from("quiz_stops")
    .insert({
      type,
      categories,
      location: locationPoint,
      coin_budget: DEFAULT_COIN_BUDGET,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating quiz stop:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/quiz-stops");
  return { success: true, data: data as QuizStop };
}

export async function deleteQuizStop(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("quiz_stops").delete().eq("id", id);

  if (error) {
    console.error("Error deleting quiz stop:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/quiz-stops");
  return { success: true };
}
