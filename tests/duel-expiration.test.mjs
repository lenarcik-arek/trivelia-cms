import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(
  new URL("../supabase_schema.sql", import.meta.url),
  "utf8"
);

function functionBody(startMarker, endMarker) {
  const start = schema.indexOf(startMarker);
  const end = schema.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start);
  return schema.slice(start, end);
}

test("utworzenie pojedynku nie wydłuża czasu życia stopu", () => {
  const createDuel = functionBody(
    "CREATE OR REPLACE FUNCTION public.create_duel(",
    "-- 12.2 join_duel"
  );

  assert.match(createDuel, /v_expires_at := v_stop\.expires_at/);
  assert.doesNotMatch(createDuel, /interval '2 hours'/);
  assert.doesNotMatch(
    createDuel,
    /UPDATE public\.quiz_stops[\s\S]*SET expires_at/
  );
});

test("dołączenie zapewnia minimum 2 minuty i synchronizuje stop z pojedynkiem", () => {
  const joinDuel = functionBody(
    "CREATE OR REPLACE FUNCTION public.join_duel(",
    "-- 12.3 submit_duel_answer"
  );

  assert.match(joinDuel, /FOR UPDATE/);
  assert.match(
    joinDuel,
    /v_expires_at := GREATEST\(v_stop\.expires_at, now\(\) \+ interval '2 minutes'\)/
  );
  assert.match(
    joinDuel,
    /UPDATE public\.quiz_stops[\s\S]*SET expires_at = v_expires_at/
  );
  assert.match(
    joinDuel,
    /UPDATE public\.duels[\s\S]*expires_at = v_expires_at/
  );
  assert.match(joinDuel, /'expiresAt', v_expires_at/);
});
