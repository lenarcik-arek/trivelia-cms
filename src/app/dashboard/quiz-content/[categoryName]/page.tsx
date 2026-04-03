import { QuestionsList } from "../questions-list";
import { getCategories, getQuestions, type Category, type Question } from "../actions";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ categoryName: string }>;
}

export default async function CategoryQuestionsPage(props: PageProps) {
  const params = await props.params;
  const decodedName = decodeURIComponent(params.categoryName);
  
  const [categories, allQuestions] = await Promise.all([
    getCategories(),
    getQuestions(),
  ]);
  
  const category = categories.find((c: Category) => c.name === decodedName);
  
  if (!category) {
    notFound();
  }
  
  const questions = allQuestions.filter((q: Question) => q.category_name === decodedName);
  
  return <QuestionsList category={category} questions={questions} />;
}
