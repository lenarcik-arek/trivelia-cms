import QuizContentClient from "./quiz-content-client";
import { getCategories, getQuestions } from "./actions";

export default async function QuizContentPage() {
  const [categories, questions] = await Promise.all([
    getCategories(),
    getQuestions(),
  ]);

  return (
    <QuizContentClient 
      initialCategories={categories} 
      initialQuestions={questions} 
    />
  );
}
