"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface Category {
  id: string;
  name: string;
  created_at: string;
}

export async function getCategories(): Promise<Category[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === '42P01') {
      return [];
    }
    console.error("Error fetching categories:", error);
    return [];
  }

  return data ?? [];
}

export async function createCategory(
  name: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.from("categories").insert({
    name,
  });

  if (error) {
    console.error("Error creating category:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/categories");
  return { success: true };
}

export async function deleteCategory(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) {
    console.error("Error deleting category:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/categories");
  return { success: true };
}
