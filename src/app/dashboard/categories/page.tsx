import CategoriesClient from "./categories-client";
import { getCategories } from "./actions";

export default async function CategoriesPage() {
  const categories = await getCategories();

  return <CategoriesClient initialCategories={categories} />;
}
