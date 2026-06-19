import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(
  new URL("../supabase_schema.sql", import.meta.url),
  "utf8"
);

test("usuwa starą 3-parametrową sygnaturę get_nearby_quiz_stops", () => {
  const dropOldSignature =
    "DROP FUNCTION IF EXISTS public.get_nearby_quiz_stops(double precision, double precision, double precision);";
  const createNewSignature =
    "CREATE OR REPLACE FUNCTION public.get_nearby_quiz_stops(";

  const dropIndex = schema.indexOf(dropOldSignature);
  const createIndex = schema.indexOf(createNewSignature);

  assert.notEqual(
    dropIndex,
    -1,
    "Stara sygnatura RPC musi zostać usunięta, aby wywołanie z 3 parametrami nie było niejednoznaczne."
  );
  assert.ok(
    dropIndex < createIndex,
    "Stara sygnatura RPC musi zostać usunięta przed utworzeniem nowej wersji."
  );
});

test("nie ukrywa pobliskich quiz stopów na podstawie budżetu lub puli pytań", () => {
  const rpcStart = schema.indexOf(
    "CREATE OR REPLACE FUNCTION public.get_nearby_quiz_stops("
  );
  const rpcEnd = schema.indexOf(
    "-- 6. RPC: start_quiz_session",
    rpcStart
  );
  const rpc = schema.slice(rpcStart, rpcEnd);

  assert.ok(rpcStart >= 0 && rpcEnd > rpcStart);
  assert.doesNotMatch(
    rpc,
    /qs\.coin_budget\s*>\s*0/,
    "Budżet wpływa na nagrody, ale nie może usuwać markera z mapy."
  );
  assert.doesNotMatch(
    rpc,
    /unnest\(qs\.categories\)/,
    "Dostępność pytań jest prezentowana po wejściu w stop i nie może usuwać markera z mapy."
  );
});
