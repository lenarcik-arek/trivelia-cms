import QuestionsClient from "./questions-client";
import { getQuestions } from "./actions";
import { getCategories } from "../categories/actions";

export default async function QuestionsPage() {
  const [questions, categories] = await Promise.all([
    getQuestions(),
    getCategories(),
  ]);

  return <QuestionsClient initialQuestions={questions} categories={categories} />;
}
