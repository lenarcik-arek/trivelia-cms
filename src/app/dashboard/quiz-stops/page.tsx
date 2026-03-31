import QuizStopsMapWrapper from "./quiz-stops-map-wrapper";
import { getQuizStops } from "./actions";

export default async function QuizStopsPage() {
  const stops = await getQuizStops();

  return <QuizStopsMapWrapper initialStops={stops} />;
}
