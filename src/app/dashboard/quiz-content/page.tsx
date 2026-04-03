import { CategoriesGrid } from "./categories-grid";
import { getCategories, getQuestions } from "./actions";

export default async function QuizContentPage() {
  const [categories, questions] = await Promise.all([
    getCategories(),
    getQuestions(),
  ]);

  return <CategoriesGrid categories={categories} questions={questions} />;
}
