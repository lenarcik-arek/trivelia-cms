/** Standard server action response */
export interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

/** Quiz stop status */
export type QuizStopStatus = "active" | "inactive";

/** Quiz stop type */
export type QuizStopType = "normal" | "premium";
