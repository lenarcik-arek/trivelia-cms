"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface Answer {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  category_name: string;
  text: string;
  answers: Answer[];
  created_at: string;
}

export async function getQuestions(): Promise<Question[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("questions")
    .select("id, category_name, text, answers, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === '42P01') return []; // table doesn't exist yet
    console.error("Error fetching questions:", error);
    return [];
  }

  return data ?? [];
}

export async function createQuestion(
  category_name: string,
  text: string,
  answers: Omit<Answer, "id">[]
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  // Zapewnienie, że poprawna odpowiedź dostaje ID z przyrostkiem _correct dla prostego prototypowania w apce mobilnej
  const finalizedAnswers: Answer[] = answers.map((a) => ({
    ...a,
    id: a.isCorrect ? `${crypto.randomUUID()}_correct` : crypto.randomUUID(),
  }));

  const { error } = await supabase.from("questions").insert({
    category_name,
    text,
    answers: finalizedAnswers,
  });

  if (error) {
    console.error("Error creating question:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/questions");
  return { success: true };
}

export async function deleteQuestion(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.from("questions").delete().eq("id", id);

  if (error) {
    console.error("Error deleting question:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/questions");
  return { success: true };
}
