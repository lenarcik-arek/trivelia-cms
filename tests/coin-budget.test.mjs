import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(
  new URL("../supabase_schema.sql", import.meta.url),
  "utf8"
);
const mapComponent = await readFile(
  new URL(
    "../src/app/dashboard/quiz-stops/quiz-stops-map.tsx",
    import.meta.url
  ),
  "utf8"
);
const tableComponent = await readFile(
  new URL(
    "../src/app/dashboard/quiz-stops/components/quiz-stops-table.tsx",
    import.meta.url
  ),
  "utf8"
);

function functionBody(startMarker, endMarker) {
  const start = schema.indexOf(startMarker);
  const end = schema.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start);
  return schema.slice(start, end);
}

test("generator stosuje coin_budget tylko do stopów premium", () => {
  const generator = functionBody(
    "CREATE OR REPLACE FUNCTION public.ensure_auto_quiz_stops_near(",
    "-- 5. RPC: get_nearby_quiz_stops"
  );

  assert.doesNotMatch(
    generator,
    /WHERE qs\.expires_at > now\(\)\s+AND qs\.coin_budget > 0/
  );
  assert.match(
    generator,
    /qs\.type = 'normal' OR qs\.coin_budget > 0/
  );
  assert.match(generator, /'normal',\s+v_categories,\s+0,/);
});

test("quiz solo limituje budżet wyłącznie dla stopów premium", () => {
  const submitQuiz = functionBody(
    "CREATE OR REPLACE FUNCTION public.submit_quiz_answer(",
    "-- ==========================================\n-- 7b. USER PLAYED QUIZZES"
  );

  assert.match(
    submitQuiz,
    /stop_record\.type = 'normal'[\s\S]*coins_to_award := 1/
  );
  assert.match(
    submitQuiz,
    /stop_record\.type = 'premium'[\s\S]*coin_budget > 0/
  );
});

test("pojedynki nie zmniejszają budżetu zwykłego stopu", () => {
  const completeDuel = functionBody(
    "CREATE OR REPLACE FUNCTION public.complete_duel(",
    "-- 12.5 get_active_duels_for_stop"
  );

  assert.doesNotMatch(completeDuel, /coin_budget/);
});

test("CMS traktuje budżet zwykłego stopu jako nielimitowany", () => {
  assert.match(
    mapComponent,
    /stop\.type === "premium" && stop\.coin_budget <= 0/
  );
  assert.match(mapComponent, /Bez limitu/);
  assert.match(tableComponent, /Bez limitu/);
});
