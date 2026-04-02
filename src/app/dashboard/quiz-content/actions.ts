"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types";

// --- Types ---

export interface Category {
  id: string;
  name: string;
  created_at: string;
}

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

// --- Categories Actions ---

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") return [];
    console.error("Error fetching categories:", error);
    return [];
  }

  return data ?? [];
}

export async function createCategory(name: string): Promise<ActionResult<Category>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .insert({ name })
    .select()
    .single();

  if (error) {
    console.error("Error creating category:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/quiz-content");
  return { success: true, data: data as Category };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) {
    console.error("Error deleting category:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/quiz-content");
  return { success: true };
}

// --- Questions Actions ---

export async function getQuestions(): Promise<Question[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("questions")
    .select("id, category_name, text, answers, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01") return [];
    console.error("Error fetching questions:", error);
    return [];
  }

  return data ?? [];
}

export async function createQuestion(
  category_name: string,
  text: string,
  answers: Omit<Answer, "id">[]
): Promise<ActionResult<Question>> {
  const supabase = await createClient();

  const finalizedAnswers: Answer[] = answers.map((a) => ({
    ...a,
    id: a.isCorrect ? `${crypto.randomUUID()}_correct` : crypto.randomUUID(),
  }));

  const { data, error } = await supabase
    .from("questions")
    .insert({ category_name, text, answers: finalizedAnswers })
    .select()
    .single();

  if (error) {
    console.error("Error creating question:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/quiz-content");
  return { success: true, data: data as Question };
}

export async function deleteQuestion(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("questions").delete().eq("id", id);

  if (error) {
    console.error("Error deleting question:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/quiz-content");
  return { success: true };
}
