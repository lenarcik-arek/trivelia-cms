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

test("ukrywa zwykły quiz stop dopiero po wyczerpaniu pytań ze wszystkich kategorii", () => {
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
  assert.match(
    rpc,
    /qs\.type\s*<>\s*'normal'[\s\S]*unnest\(qs\.categories\)[\s\S]*NOT EXISTS[\s\S]*upq\.user_id = auth\.uid\(\)[\s\S]*upq\.question_id = q\.id/,
    "Zwykły stop musi pozostać widoczny, jeśli ma choć jedno nieograne pytanie w przypisanych kategoriach."
  );
});

test("generator liczy i wybiera tylko stopy dostępne dla bieżącego użytkownika", () => {
  const generatorStart = schema.indexOf(
    "CREATE OR REPLACE FUNCTION public.ensure_auto_quiz_stops_near("
  );
  const generatorEnd = schema.indexOf(
    "-- 5. RPC: get_nearby_quiz_stops",
    generatorStart
  );
  const generator = schema.slice(generatorStart, generatorEnd);

  assert.ok(generatorStart >= 0 && generatorEnd > generatorStart);
  assert.match(
    generator,
    /unnest\(qs\.categories\)[\s\S]*upq\.user_id = auth\.uid\(\)[\s\S]*upq\.question_id = q\.id/,
    "Wyczerpane stopy nie mogą blokować wygenerowania dostępnego stopu."
  );
  assert.match(
    generator,
    /upq\.quiz_stop_id = qs\.id[\s\S]*upq\.user_id = auth\.uid\(\)/,
    "Stopy już rozegrane przez użytkownika nie mogą być liczone jako dostępne."
  );
  assert.match(
    generator,
    /q\.category_name = c\.name[\s\S]*upq\.user_id = auth\.uid\(\)[\s\S]*upq\.question_id = q\.id/,
    "Kategorie automatycznego stopu muszą zawierać pytania nieograne przez bieżącego użytkownika."
  );
});

test("RPC wymusza maksymalny promień widoczności 150 m", () => {
  const rpcStart = schema.indexOf(
    "CREATE OR REPLACE FUNCTION public.get_nearby_quiz_stops("
  );
  const rpcEnd = schema.indexOf(
    "-- 6. RPC: start_quiz_session",
    rpcStart
  );
  const rpc = schema.slice(rpcStart, rpcEnd);

  assert.ok(rpcStart >= 0 && rpcEnd > rpcStart);
  assert.match(
    rpc,
    /v_effective_radius_m double precision[\s\S]*LEAST\([\s\S]*150[\s\S]*\)/,
    "RPC musi ograniczać promień przekazany przez klienta do 150 m."
  );
  assert.match(
    rpc,
    /ensure_auto_quiz_stops_near\([\s\S]*v_effective_radius_m/,
    "Generator musi używać tego samego ograniczonego promienia co zapytanie mapy."
  );
  assert.match(
    rpc,
    /ST_DWithin\([\s\S]*v_effective_radius_m/,
    "Zapytanie markerów musi filtrować punkty ograniczonym promieniem."
  );
});

test("generator tworzy dokładnie 2 niedostępne quiz stopy (odległość > 50m) gdy brak aktywnych", () => {
  const generatorStart = schema.indexOf(
    "CREATE OR REPLACE FUNCTION public.ensure_auto_quiz_stops_near("
  );
  const generatorEnd = schema.indexOf(
    "-- 5. RPC: get_nearby_quiz_stops",
    generatorStart
  );
  const generator = schema.slice(generatorStart, generatorEnd);

  assert.ok(generatorStart >= 0 && generatorEnd > generatorStart);
  assert.match(
    generator,
    /v_target_visible\s+int\s*:=\s*2;/,
    "Target visible count generatora powinien wynosić 2."
  );
  assert.match(
    generator,
    /IF\s+v_visible_count\s*>\s*0\s+THEN\s+RETURN\s+0;\s+END\s+IF;/i,
    "Generator powinien kończyć działanie, gdy v_visible_count > 0."
  );
  assert.match(
    generator,
    /v_distance_m\s*:=\s*55\s*\+/i,
    "Generator powinien tworzyć punkty w odległości większej niż 50m (np. od 55m)."
  );
});

