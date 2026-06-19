-- ==========================================
-- DATABASE SCHEMA FOR TRIVEL (SUPABASE)
-- Idempotent / re-runnable version
-- ==========================================

-- 0. Safety: run as a privileged role (owner/service_role) when applying migrations.
-- Be cautious when running destructive statements in production.

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;  -- provides gen_random_bytes(), gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions; -- optional, for uuid_generate_v4()

-- 2. Profiles table (1:1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  avatar_url text,
  phone text,
  birthday date,
  gender text CHECK (gender IN ('Male', 'Female', 'Uni', 'Other')),
  active_device_id uuid,
  xp integer NOT NULL DEFAULT 0,
  coins integer NOT NULL DEFAULT 0,
  quizzes_played integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable RLS and create policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_can_view_all_profiles ON public.profiles;
DROP POLICY IF EXISTS users_can_update_own_profile ON public.profiles;
DROP POLICY IF EXISTS users_can_insert_own_profile ON public.profiles;

CREATE POLICY users_can_view_all_profiles
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY users_can_update_own_profile
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ( (SELECT auth.uid()) = id )
  WITH CHECK ( (SELECT auth.uid()) = id );

CREATE POLICY users_can_insert_own_profile
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ( (SELECT auth.uid()) = id );

-- 3. Trigger function: create profile when new auth.users row is inserted
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  base_username text;
  new_username text;
  counter integer := 1;
BEGIN
  -- Default username is the part before @ in the email
  base_username := split_part(NEW.email::text, '@', 1);
  new_username := base_username;

  LOOP
    BEGIN
      INSERT INTO public.profiles (id, username, gender)
      VALUES (NEW.id, new_username, 'Uni');
      EXIT; -- Success
    EXCEPTION WHEN unique_violation THEN
      -- Username taken - try with a counter suffix
      new_username := base_username || counter::text;
      counter := counter + 1;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists exactly once
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE t.tgname = 'on_auth_user_created'
      AND n.nspname = 'auth'
      AND c.relname = 'users'
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END$$;

-- 4. Quiz stops table (uses PostGIS geography)
CREATE TABLE IF NOT EXISTS public.quiz_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES public.profiles(id),
  location geography(POINT) NOT NULL,
  type text NOT NULL DEFAULT 'normal',
  categories text[] NOT NULL DEFAULT '{}',
  coin_budget integer NOT NULL DEFAULT 20,
  generation_source text NOT NULL DEFAULT 'manual',
  generation_cell text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Cleanup old columns if they exist
DO $$ BEGIN
  ALTER TABLE public.quiz_stops DROP COLUMN IF EXISTS title;
EXCEPTION WHEN undefined_column THEN END; $$;
DO $$ BEGIN
  ALTER TABLE public.quiz_stops DROP COLUMN IF EXISTS target_gender;
EXCEPTION WHEN undefined_column THEN END; $$;

-- Migration guards: automatic quiz stop generation metadata
ALTER TABLE public.quiz_stops ADD COLUMN IF NOT EXISTS generation_source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.quiz_stops ADD COLUMN IF NOT EXISTS generation_cell text;
-- Normal stops have unlimited rewards; 0 is a compatibility sentinel.
UPDATE public.quiz_stops SET coin_budget = 0 WHERE type = 'normal' AND coin_budget <> 0;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quiz_stops_creator_id ON public.quiz_stops(creator_id);
CREATE INDEX IF NOT EXISTS idx_quiz_stops_expires_at ON public.quiz_stops(expires_at);
CREATE INDEX IF NOT EXISTS idx_quiz_stops_location_gist ON public.quiz_stops USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_quiz_stops_generation_source ON public.quiz_stops(generation_source, type, expires_at);

-- RLS for quiz_stops
ALTER TABLE public.quiz_stops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quiz_stops_all_policy ON public.quiz_stops;
CREATE POLICY quiz_stops_all_policy
  ON public.quiz_stops
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4a. RPC helper: ensure_auto_quiz_stops_near
-- MVP generator without safety-data. It keeps a small shared pool of normal
-- quiz stops around the current user and relies on short TTL + density limits.
CREATE OR REPLACE FUNCTION public.ensure_auto_quiz_stops_near(
  user_lat double precision,
  user_lng double precision,
  radius_m double precision DEFAULT 150,
  movement_bearing_deg double precision DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_point geography;
  v_cell text;
  v_accessible_count int := 0;
  v_visible_count int := 0;
  v_created int := 0;
  v_target_visible int := 3;
  v_min_stop_distance_m double precision := 70;
  v_attempt int := 0;
  v_max_attempts int := 30;
  v_distance_m double precision;
  v_bearing_deg double precision;
  v_bearing_rad double precision;
  v_candidate_lat double precision;
  v_candidate_lng double precision;
  v_candidate geography;
  v_categories text[];
  v_seed_bearing double precision := random() * 360;
BEGIN
  IF user_lat IS NULL OR user_lng IS NULL THEN
    RETURN 0;
  END IF;

  IF user_lat < -90 OR user_lat > 90 OR user_lng < -180 OR user_lng > 180 THEN
    RETURN 0;
  END IF;

  radius_m := LEAST(GREATEST(radius_m, 50), 300);
  v_user_point := ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography;
  v_cell := floor(user_lat * 1000)::text || ':' || floor(user_lng * 1000)::text;

  -- Prevent duplicate generation when many users load the same area at once.
  PERFORM pg_advisory_xact_lock(hashtext(v_cell));

  SELECT count(*) INTO v_accessible_count
  FROM public.quiz_stops qs
  WHERE qs.expires_at > now()
    AND (qs.type = 'normal' OR qs.coin_budget > 0)
    AND ST_DWithin(qs.location, v_user_point, 50)
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_played_quizzes upq
      WHERE upq.quiz_stop_id = qs.id
        AND upq.user_id = auth.uid()
    )
    AND (
      qs.type <> 'normal'
      OR EXISTS (
        SELECT 1
        FROM unnest(qs.categories) AS stop_category(name)
        JOIN public.questions q ON q.category_name = stop_category.name
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.user_played_quizzes upq
          WHERE upq.user_id = auth.uid()
            AND upq.question_id = q.id
        )
      )
    );

  SELECT count(*) INTO v_visible_count
  FROM public.quiz_stops qs
  WHERE qs.expires_at > now()
    AND (qs.type = 'normal' OR qs.coin_budget > 0)
    AND ST_DWithin(qs.location, v_user_point, radius_m)
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_played_quizzes upq
      WHERE upq.quiz_stop_id = qs.id
        AND upq.user_id = auth.uid()
    )
    AND (
      qs.type <> 'normal'
      OR EXISTS (
        SELECT 1
        FROM unnest(qs.categories) AS stop_category(name)
        JOIN public.questions q ON q.category_name = stop_category.name
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.user_played_quizzes upq
          WHERE upq.user_id = auth.uid()
            AND upq.question_id = q.id
        )
      )
    );

  IF v_accessible_count > 0 AND v_visible_count >= v_target_visible THEN
    RETURN 0;
  END IF;

  SELECT array_agg(name) INTO v_categories
  FROM (
    SELECT c.name
    FROM public.categories c
    WHERE COALESCE(c.is_premium, false) = false
      AND EXISTS (
        SELECT 1
        FROM public.questions q
        WHERE q.category_name = c.name
          AND NOT EXISTS (
            SELECT 1
            FROM public.user_played_quizzes upq
            WHERE upq.user_id = auth.uid()
              AND upq.question_id = q.id
          )
      )
    ORDER BY random()
    LIMIT 3
  ) picked;

  IF v_categories IS NULL OR array_length(v_categories, 1) = 0 THEN
    RETURN 0;
  END IF;

  WHILE (v_accessible_count = 0 OR v_visible_count < v_target_visible) AND v_attempt < v_max_attempts LOOP
    v_attempt := v_attempt + 1;

    IF v_accessible_count = 0 THEN
      v_distance_m := 25 + random() * 20;
      v_bearing_deg := random() * 360;
    ELSE
      v_distance_m := LEAST(80 + random() * GREATEST(radius_m - 80, 1), radius_m);

      IF movement_bearing_deg IS NULL THEN
        v_bearing_deg := v_seed_bearing + (v_created * 120) + (random() * 40 - 20);
      ELSE
        v_bearing_deg := movement_bearing_deg + (random() * 90 - 45);
      END IF;
    END IF;

    v_bearing_rad := radians(mod((v_bearing_deg + 360)::numeric, 360)::double precision);
    v_candidate_lat := user_lat + (cos(v_bearing_rad) * v_distance_m / 110540);
    v_candidate_lng := user_lng + (sin(v_bearing_rad) * v_distance_m / (111320 * GREATEST(cos(radians(user_lat)), 0.01)));
    v_candidate := ST_SetSRID(ST_MakePoint(v_candidate_lng, v_candidate_lat), 4326)::geography;

    IF EXISTS (
      SELECT 1
      FROM public.quiz_stops qs
      WHERE qs.expires_at > now()
        AND (qs.type = 'normal' OR qs.coin_budget > 0)
        AND ST_DWithin(qs.location, v_candidate, v_min_stop_distance_m)
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_played_quizzes upq
          WHERE upq.quiz_stop_id = qs.id
            AND upq.user_id = auth.uid()
        )
        AND (
          qs.type <> 'normal'
          OR EXISTS (
            SELECT 1
            FROM unnest(qs.categories) AS stop_category(name)
            JOIN public.questions q ON q.category_name = stop_category.name
            WHERE NOT EXISTS (
              SELECT 1
              FROM public.user_played_quizzes upq
              WHERE upq.user_id = auth.uid()
                AND upq.question_id = q.id
            )
          )
        )
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.quiz_stops (
      location,
      type,
      categories,
      coin_budget,
      generation_source,
      generation_cell,
      expires_at
    )
    VALUES (
      v_candidate,
      'normal',
      v_categories,
      0,
      'auto',
      v_cell,
      now() + interval '6 hours'
    );

    v_created := v_created + 1;
    v_visible_count := v_visible_count + 1;
    IF v_accessible_count = 0 AND ST_DWithin(v_candidate, v_user_point, 50) THEN
      v_accessible_count := 1;
    END IF;
  END LOOP;

  RETURN v_created;
END;
$$;

-- 5. RPC: get_nearby_quiz_stops (spatial query)
-- Adding an optional fourth argument creates a separate PostgreSQL overload.
-- Remove the legacy overload first so 3-argument PostgREST calls stay unambiguous.
DROP FUNCTION IF EXISTS public.get_nearby_quiz_stops(double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION public.get_nearby_quiz_stops(
  user_lat double precision,
  user_lng double precision,
  radius_m double precision DEFAULT 150,
  movement_bearing_deg double precision DEFAULT NULL
)
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.ensure_auto_quiz_stops_near(
    user_lat,
    user_lng,
    radius_m,
    movement_bearing_deg
  );

  RETURN QUERY
  SELECT json_build_object(
    'id', qs.id,
    'location', qs.location::text,
    'type', qs.type,
    'categories', qs.categories,
    'coin_budget', qs.coin_budget,
    'generation_source', COALESCE(qs.generation_source, 'manual'),
    'is_premium', qs.is_premium
  )
  FROM public.quiz_stops qs
  WHERE qs.expires_at > now()
    AND ST_DWithin(
      qs.location,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
      radius_m
    )
    -- Hide stops the user already played at
    AND NOT EXISTS (
      SELECT 1 FROM public.user_played_quizzes upq
      WHERE upq.quiz_stop_id = qs.id AND upq.user_id = auth.uid()
    )
    -- Normal stops stay visible only while at least one assigned category
    -- contains a question the current user has not played anywhere yet.
    AND (
      qs.type <> 'normal'
      OR EXISTS (
        SELECT 1
        FROM unnest(qs.categories) AS stop_category(name)
        JOIN public.questions q ON q.category_name = stop_category.name
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.user_played_quizzes upq
          WHERE upq.user_id = auth.uid()
            AND upq.question_id = q.id
        )
      )
    );
END;
$$;

-- 6. RPC: start_quiz_session (validation and proximity check)
CREATE OR REPLACE FUNCTION public.start_quiz_session(
  user_lat double precision,
  user_lng double precision,
  stop_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stop_record public.quiz_stops%ROWTYPE;
  dist double precision;
  session_token text;
BEGIN
  SELECT * INTO stop_record FROM public.quiz_stops WHERE id = stop_id AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz Stop does not exist or has expired.';
  END IF;

  -- Distance in meters using geography types
  dist := ST_Distance(
    stop_record.location,
    ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
  );

  IF dist > 50 THEN
    RAISE EXCEPTION 'Too far from stop (Distance: %). Required < 50m.', round(dist::numeric, 1);
  END IF;

  session_token := encode(gen_random_bytes(16), 'hex');

  RETURN json_build_object(
    'sessionToken', session_token,
    'expiresAt', (now() + interval '180 seconds'),
    'quizStopId', stop_id
  );
END;
$$;

-- 7. RPC: submit_quiz_answer (server-side answer verification, reward routing)
-- Awards XP to both profiles.xp (global) and user_category_xp (per-category).
-- Awards normal coins to profiles.coins OR premium coins to user_premium_wallets.
CREATE OR REPLACE FUNCTION public.submit_quiz_answer(
  p_stop_id uuid,
  p_question_id uuid,
  p_answer_index int
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stop_record public.quiz_stops%ROWTYPE;
  v_question_answers jsonb;
  v_category_name text;
  v_is_correct boolean := false;
  v_is_premium boolean := false;
  coins_to_award integer := 0;
  xp_to_award integer := 0;
  v_user_id uuid := auth.uid();
BEGIN
  -- Server-side answer verification: look up the question and check is_correct
  SELECT q.answers, q.category_name INTO v_question_answers, v_category_name
  FROM public.questions q
  WHERE q.id = p_question_id;

  IF v_question_answers IS NOT NULL AND p_answer_index >= 0
     AND p_answer_index < jsonb_array_length(v_question_answers) THEN
    v_is_correct := COALESCE(
      (v_question_answers -> p_answer_index ->> 'is_correct')::boolean,
      (v_question_answers -> p_answer_index ->> 'isCorrect')::boolean,
      false
    );
  END IF;

  -- Update the played record with the verified result
  UPDATE public.user_played_quizzes
  SET is_correct = v_is_correct
  WHERE user_id = v_user_id AND question_id = p_question_id;

  IF NOT v_is_correct THEN
    RETURN json_build_object('isCorrect', false, 'xpEarned', 0, 'coinsEarned', 0, 'isPremiumCoin', false, 'categoryName', v_category_name);
  END IF;

  xp_to_award := 1;

  SELECT * INTO stop_record
  FROM public.quiz_stops
  WHERE id = p_stop_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz Stop does not exist.';
  END IF;

  v_is_premium := stop_record.type = 'premium';

  IF stop_record.type = 'normal' THEN
    coins_to_award := 1;
  ELSIF stop_record.type = 'premium' THEN
    -- Premium rewards remain limited by the campaign budget.
    UPDATE public.quiz_stops
    SET coin_budget = coin_budget - 1
    WHERE id = p_stop_id AND coin_budget > 0
    RETURNING * INTO stop_record;

    IF FOUND THEN
      coins_to_award := 1;
    END IF;
  END IF;

  -- Always update global XP
  UPDATE public.profiles
  SET xp = xp + xp_to_award
  WHERE id = v_user_id;

  -- Always update per-category XP
  INSERT INTO public.user_category_xp (user_id, category_name, xp)
  VALUES (v_user_id, v_category_name, xp_to_award)
  ON CONFLICT (user_id, category_name)
  DO UPDATE SET xp = public.user_category_xp.xp + xp_to_award;

  -- Route coins: normal → profiles.coins, premium → user_premium_wallets
  IF coins_to_award > 0 THEN
    IF v_is_premium THEN
      INSERT INTO public.user_premium_wallets (user_id, category_name, coins)
      VALUES (v_user_id, v_category_name, coins_to_award)
      ON CONFLICT (user_id, category_name)
      DO UPDATE SET coins = public.user_premium_wallets.coins + coins_to_award;
    ELSE
      UPDATE public.profiles
      SET coins = coins + coins_to_award
      WHERE id = v_user_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'isCorrect', v_is_correct,
    'xpEarned', xp_to_award,
    'coinsEarned', coins_to_award,
    'isPremiumCoin', v_is_premium,
    'categoryName', v_category_name
  );
END;
$$;

-- ==========================================
-- 7b. USER PLAYED QUIZZES (deduplication tracking)
-- ==========================================

-- Tracks which specific questions a user has played (not just which stops).
-- UNIQUE(user_id, question_id) ensures a user can only play a given question once.
CREATE TABLE IF NOT EXISTS public.user_played_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  quiz_stop_id uuid NOT NULL REFERENCES public.quiz_stops(id) ON DELETE CASCADE,
  is_correct boolean NOT NULL DEFAULT false,
  played_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, question_id)
);

ALTER TABLE public.user_played_quizzes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS upq_users_can_view_own ON public.user_played_quizzes;
CREATE POLICY upq_users_can_view_own
  ON public.user_played_quizzes
  FOR SELECT
  TO authenticated
  USING ( (SELECT auth.uid()) = user_id );

DROP POLICY IF EXISTS upq_users_can_insert_own ON public.user_played_quizzes;
CREATE POLICY upq_users_can_insert_own
  ON public.user_played_quizzes
  FOR INSERT
  TO authenticated
  WITH CHECK ( (SELECT auth.uid()) = user_id );

CREATE INDEX IF NOT EXISTS idx_upq_user_id ON public.user_played_quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_upq_question_id ON public.user_played_quizzes(question_id);

-- ==========================================
-- 7c. RPC: get_random_unplayed_quiz
-- ==========================================
-- Picks a random question from a category that the current user hasn't played yet.
-- Records the question as played IMMEDIATELY (prevents re-selection on crash/timeout).
-- Increments quizzes_played in profiles.
-- Strips is_correct from answers before returning to client (server-side verification).
-- Returns NULL if all questions in that category have been played.

CREATE OR REPLACE FUNCTION public.get_random_unplayed_quiz(
  p_category text,
  p_stop_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_question record;
  v_clean_answers json;
BEGIN
  -- Block entirely if user already played ANYTHING at this quiz stop
  IF EXISTS (SELECT 1 FROM public.user_played_quizzes WHERE user_id = v_user_id AND quiz_stop_id = p_stop_id) THEN
    RETURN NULL;
  END IF;

  SELECT q.id, q.text, q.answers, q.category_name
  INTO v_question
  FROM public.questions q
  WHERE q.category_name = p_category
    AND q.id NOT IN (
      SELECT upq.question_id
      FROM public.user_played_quizzes upq
      WHERE upq.user_id = v_user_id
    )
  ORDER BY random()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Record as played IMMEDIATELY (is_correct defaults to false, updated by submit_quiz_answer)
  INSERT INTO public.user_played_quizzes (user_id, question_id, quiz_stop_id, is_correct)
  VALUES (v_user_id, v_question.id, p_stop_id, false)
  ON CONFLICT (user_id, question_id) DO NOTHING;

  -- Increment quizzes_played counter (only when a real question is served)
  UPDATE public.profiles
  SET quizzes_played = quizzes_played + 1
  WHERE id = v_user_id;

  -- Strip is_correct from answers — client must NOT know the correct answer
  SELECT json_agg(
    json_build_object('text', a->>'text', 'index', (idx - 1)::int)
  ) INTO v_clean_answers
  FROM jsonb_array_elements(v_question.answers) WITH ORDINALITY AS t(a, idx);

  RETURN json_build_object(
    'id', v_question.id,
    'text', v_question.text,
    'answers', v_clean_answers,
    'category_name', v_question.category_name
  );
END;
$$;

-- ==========================================
-- 7d. RPC: get_available_categories_for_stop
-- ==========================================
-- For a given quiz stop, returns assigned categories with info about
-- how many unplayed questions remain for the current user in each category.
-- Categories with 0 total questions in the DB are EXCLUDED entirely.
-- Categories with 0 remaining (but total > 0) are marked as "exhausted" (grayed-out UI).

CREATE OR REPLACE FUNCTION public.get_available_categories_for_stop(
  p_stop_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_categories text[];
  v_cat text;
  v_unplayed_count int;
  v_total_count int;
  v_result json[] := '{}';
BEGIN
  SELECT categories INTO v_categories
  FROM public.quiz_stops
  WHERE id = p_stop_id AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object('categories', '[]'::json, 'stop_exists', false);
  END IF;

  FOREACH v_cat IN ARRAY v_categories LOOP
    SELECT count(*) INTO v_total_count
    FROM public.questions q
    WHERE q.category_name = v_cat;

    -- Skip categories with 0 questions in the DB entirely
    IF v_total_count = 0 THEN
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_unplayed_count
    FROM public.questions q
    WHERE q.category_name = v_cat
      AND q.id NOT IN (
        SELECT upq.question_id
        FROM public.user_played_quizzes upq
        WHERE upq.user_id = v_user_id
      );

    -- If user has participated in ANY quiz/duel at this stop, all categories are exhausted
    IF EXISTS (
      SELECT 1 FROM public.user_played_quizzes
      WHERE user_id = v_user_id AND quiz_stop_id = p_stop_id
    ) THEN
      v_unplayed_count := 0;
    END IF;

    v_result := array_append(v_result, json_build_object(
      'name', v_cat,
      'total_questions', v_total_count,
      'unplayed_questions', v_unplayed_count,
      'is_exhausted', (v_unplayed_count = 0)
    ));
  END LOOP;

  RETURN json_build_object(
    'categories', array_to_json(v_result),
    'stop_exists', true
  );
END;
$$;

-- ==========================================
-- 8. CMS SYSTEM TABLES (TRIVELIA CMS)
-- ==========================================

-- 8.1 cms_admins: Users with permission to access the CMS dashboard
CREATE TABLE IF NOT EXISTS public.cms_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.cms_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cms_admins_read_own ON public.cms_admins;
CREATE POLICY cms_admins_read_own
  ON public.cms_admins
  FOR SELECT
  TO authenticated
  USING ( (SELECT auth.jwt() ->> 'email') = email );

-- 8.2 organizations: B2B hierarchy (brands, cities, etc.)
-- parent_organization_id enables sub-organizations (e.g., Nike → Nike Running, Nike Basketball)
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  parent_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Migration: add column if table already existed without it
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS parent_organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_view_all_authenticated ON public.organizations;
CREATE POLICY organizations_view_all_authenticated
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_organizations_parent ON public.organizations(parent_organization_id);

-- 8.3 categories: Pool of question categories (normal + premium)
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_premium boolean NOT NULL DEFAULT false,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Migration: add columns if table already exists
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_view_all_authenticated ON public.categories;
CREATE POLICY categories_view_all_authenticated
  ON public.categories
  FOR SELECT
  TO authenticated
  USING (true);

-- CMS admins can manage categories
DROP POLICY IF EXISTS categories_cms_insert ON public.categories;
CREATE POLICY categories_cms_insert ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cms_admins WHERE email = (SELECT auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS categories_cms_update ON public.categories;
CREATE POLICY categories_cms_update ON public.categories
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cms_admins WHERE email = (SELECT auth.jwt() ->> 'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cms_admins WHERE email = (SELECT auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS categories_cms_delete ON public.categories;
CREATE POLICY categories_cms_delete ON public.categories
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cms_admins WHERE email = (SELECT auth.jwt() ->> 'email')));

-- 8.3 questions: Question database with JSONB answers
CREATE TABLE IF NOT EXISTS public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name text NOT NULL REFERENCES public.categories(name) ON DELETE CASCADE ON UPDATE CASCADE,
  text text NOT NULL,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS questions_view_all_authenticated ON public.questions;
CREATE POLICY questions_view_all_authenticated
  ON public.questions
  FOR SELECT
  TO authenticated
  USING (true);

-- CMS admins can manage questions
DROP POLICY IF EXISTS questions_cms_insert ON public.questions;
CREATE POLICY questions_cms_insert ON public.questions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.cms_admins WHERE email = (SELECT auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS questions_cms_update ON public.questions;
CREATE POLICY questions_cms_update ON public.questions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cms_admins WHERE email = (SELECT auth.jwt() ->> 'email')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.cms_admins WHERE email = (SELECT auth.jwt() ->> 'email')));

DROP POLICY IF EXISTS questions_cms_delete ON public.questions;
CREATE POLICY questions_cms_delete ON public.questions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.cms_admins WHERE email = (SELECT auth.jwt() ->> 'email')));

-- ==========================================
-- 9. REALTIME & MAINTENANCE
-- ==========================================

-- Enable Supabase Realtime for quiz_stops (for map marker updates)
BEGIN;
  DO $$
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END$$;
COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'quiz_stops'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_stops;
  END IF;
END$$;

-- Migration helper: ensures all columns exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_device_id uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;
ALTER TABLE public.quiz_stops ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;

-- ==========================================
-- 10. REWARD ECONOMY TABLES
-- ==========================================

-- 10.1 user_category_xp: Per-category XP tracking for category rankings
-- Global profiles.xp = SUM of all user_category_xp rows for that user
CREATE TABLE IF NOT EXISTS public.user_category_xp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  xp integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, category_name)
);

ALTER TABLE public.user_category_xp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ucx_users_can_view_own ON public.user_category_xp;
CREATE POLICY ucx_users_can_view_own
  ON public.user_category_xp
  FOR SELECT
  TO authenticated
  USING ( (SELECT auth.uid()) = user_id );

-- Allow viewing all for ranking purposes
DROP POLICY IF EXISTS ucx_users_can_view_all ON public.user_category_xp;
CREATE POLICY ucx_users_can_view_all
  ON public.user_category_xp
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_ucx_user_id ON public.user_category_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_ucx_category ON public.user_category_xp(category_name);

-- 10.2 user_premium_wallets: Premium coin wallets per brand/category
-- Each premium category has its own separate wallet per user
CREATE TABLE IF NOT EXISTS public.user_premium_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  coins integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, category_name)
);

ALTER TABLE public.user_premium_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS upw_users_can_view_own ON public.user_premium_wallets;
CREATE POLICY upw_users_can_view_own
  ON public.user_premium_wallets
  FOR SELECT
  TO authenticated
  USING ( (SELECT auth.uid()) = user_id );

CREATE INDEX IF NOT EXISTS idx_upw_user_id ON public.user_premium_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_upw_category ON public.user_premium_wallets(category_name);

-- ==========================================
-- 11. DUEL SYSTEM TABLES
-- ==========================================

-- 11.1 duels: 1v1 asynchronous duel challenges
CREATE TABLE IF NOT EXISTS public.duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_stop_id uuid NOT NULL REFERENCES public.quiz_stops(id) ON DELETE CASCADE,
  category_name text NOT NULL,
  initiator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joiner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed', 'expired')),
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at timestamptz NOT NULL,
  initiator_notified boolean NOT NULL DEFAULT false,
  joiner_notified boolean NOT NULL DEFAULT false,
  initiator_stories_viewed boolean NOT NULL DEFAULT false,
  joiner_stories_viewed boolean NOT NULL DEFAULT false
);

-- Migration guard: add initiator_notified if it doesn't exist yet (idempotent)
DO $$ BEGIN
  ALTER TABLE public.duels ADD COLUMN initiator_notified boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Migration guard: add joiner_notified if it doesn't exist yet (idempotent)
DO $$ BEGIN
  ALTER TABLE public.duels ADD COLUMN joiner_notified boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Migration guard: add initiator_stories_viewed if it doesn't exist yet
DO $$ BEGIN
  ALTER TABLE public.duels ADD COLUMN initiator_stories_viewed boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Migration guard: add joiner_stories_viewed if it doesn't exist yet
DO $$ BEGIN
  ALTER TABLE public.duels ADD COLUMN joiner_stories_viewed boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

ALTER TABLE public.duels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duels_view_all_authenticated ON public.duels;
CREATE POLICY duels_view_all_authenticated
  ON public.duels
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_duels_stop_id ON public.duels(quiz_stop_id);
CREATE INDEX IF NOT EXISTS idx_duels_status ON public.duels(status);
CREATE INDEX IF NOT EXISTS idx_duels_initiator ON public.duels(initiator_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_duels_unique_waiting ON public.duels (quiz_stop_id, category_name) WHERE status = 'waiting';

-- 11.2 duel_answers: Individual answer records for each duel participant
CREATE TABLE IF NOT EXISTS public.duel_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid NOT NULL REFERENCES public.duels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_index int NOT NULL CHECK (question_index >= 0 AND question_index <= 2),
  answer_index int NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  time_ms int NOT NULL DEFAULT 15000,
  UNIQUE(duel_id, user_id, question_index)
);

ALTER TABLE public.duel_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duel_answers_view_all_authenticated ON public.duel_answers;
CREATE POLICY duel_answers_view_all_authenticated
  ON public.duel_answers
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_duel_answers_duel_id ON public.duel_answers(duel_id);

-- ==========================================
-- 12. DUEL SYSTEM RPCs
-- ==========================================

-- 12.0 check_duel_conflict: Check if a waiting duel already exists for this category/stop
-- and whether the current user has played any of its questions (blocking join).
-- Returns: { conflictExists, duelId, initiatorId, questionsAlreadyPlayed }
CREATE OR REPLACE FUNCTION public.check_duel_conflict(
  p_stop_id uuid,
  p_category text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_duel record;
  v_questions_played int := 0;
  v_question_ids uuid[];
BEGIN
  -- Look for a waiting duel in this category/stop (not created by the calling user)
  SELECT * INTO v_duel
  FROM public.duels
  WHERE quiz_stop_id = p_stop_id
    AND category_name = p_category
    AND status = 'waiting'
    AND expires_at > now()
    AND initiator_id <> v_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('conflictExists', false);
  END IF;

  -- Extract question IDs from the duel's questions JSONB array
  SELECT array_agg((q->>'id')::uuid)
  INTO v_question_ids
  FROM jsonb_array_elements(v_duel.questions) AS q;

  -- Count how many of those questions the current user has already played
  SELECT count(*) INTO v_questions_played
  FROM public.user_played_quizzes
  WHERE user_id = v_user_id
    AND question_id = ANY(v_question_ids);

  RETURN json_build_object(
    'conflictExists', true,
    'duelId', v_duel.id,
    'initiatorId', v_duel.initiator_id,
    'questionsAlreadyPlayed', v_questions_played
  );
END;
$$;

-- 12.1 create_duel: Initiator creates a duel at a normal quiz stop
-- Validates proximity, checks >= 3 unplayed questions, selects 3 questions,
-- records them as played, creates duel row with status='waiting'.
CREATE OR REPLACE FUNCTION public.create_duel(
  p_stop_id uuid,
  p_category text,
  p_user_lat double precision,
  p_user_lng double precision
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_stop record;
  v_dist double precision;
  v_questions json;
  v_question_ids uuid[];
  v_q record;
  v_clean_questions json;
  v_duel_id uuid;
  v_expires_at timestamptz;
BEGIN
  -- Fetch stop and validate
  SELECT * INTO v_stop FROM public.quiz_stops WHERE id = p_stop_id AND expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz stop does not exist or has expired.';
  END IF;

  -- Block duels at premium stops based on Game Rule: Premium stops are Solo-play only
  IF v_stop.type = 'premium' THEN
    RAISE EXCEPTION 'Duels are not allowed at premium stops.';
  END IF;

  -- Check proximity
  v_dist := ST_Distance(
    v_stop.location,
    ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326)::geography
  );
  IF v_dist > 50 THEN
    RAISE EXCEPTION 'Too far from stop (Distance: %). Required < 50m.', round(v_dist::numeric, 1);
  END IF;

  -- Block entirely if user already played ANYTHING at this quiz stop
  IF EXISTS (SELECT 1 FROM public.user_played_quizzes WHERE user_id = v_user_id AND quiz_stop_id = p_stop_id) THEN
    RAISE EXCEPTION 'You have already played at this quiz stop.';
  END IF;

  -- Check for existing waiting duel in this category and this stop
  IF EXISTS (
    SELECT 1 FROM public.duels
    WHERE quiz_stop_id = p_stop_id
      AND category_name = p_category
      AND status = 'waiting'
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'An active duel already exists for this category at this stop.';
  END IF;

  -- Select 3 unplayed questions from the category
  SELECT array_agg(q.id), json_agg(json_build_object(
    'id', q.id,
    'text', q.text,
    'answers', (
      SELECT json_agg(a ORDER BY random())
      FROM jsonb_array_elements(q.answers) a
    )
  ))
  INTO v_question_ids, v_questions
  FROM (
    SELECT q2.id, q2.text, q2.answers
    FROM public.questions q2
    WHERE q2.category_name = p_category
      AND q2.id NOT IN (
        SELECT upq.question_id
        FROM public.user_played_quizzes upq
        WHERE upq.user_id = v_user_id
      )
    ORDER BY random()
    LIMIT 3
  ) q;

  IF v_question_ids IS NULL OR array_length(v_question_ids, 1) < 3 THEN
    RAISE EXCEPTION 'Not enough unplayed questions in this category (need 3).';
  END IF;

  -- Record all 3 questions as played immediately
  INSERT INTO public.user_played_quizzes (user_id, question_id, quiz_stop_id, is_correct)
  SELECT v_user_id, unnest(v_question_ids), p_stop_id, false
  ON CONFLICT (user_id, question_id) DO NOTHING;

  -- Increment quizzes_played by 3
  UPDATE public.profiles
  SET quizzes_played = quizzes_played + 3
  WHERE id = v_user_id;

  v_expires_at := v_stop.expires_at;

  -- A waiting duel must never outlive its quiz stop.
  INSERT INTO public.duels (quiz_stop_id, category_name, initiator_id, status, questions, expires_at)
  VALUES (p_stop_id, p_category, v_user_id, 'waiting', v_questions::jsonb, v_expires_at)
  RETURNING id INTO v_duel_id;

  -- Build clean questions (strip is_correct from answers)
  SELECT json_agg(
    json_build_object(
      'id', dq->>'id',
      'text', dq->>'text',
      'answers', (
        SELECT json_agg(json_build_object('text', a->>'text', 'index', (idx - 1)::int))
        FROM jsonb_array_elements((dq->>'answers')::jsonb) WITH ORDINALITY AS t(a, idx)
      )
    )
  ) INTO v_clean_questions
  FROM json_array_elements(v_questions) AS dq;

  RETURN json_build_object(
    'duelId', v_duel_id,
    'status', 'waiting',
    'categoryName', p_category,
    'expiresAt', v_expires_at,
    'questions', v_clean_questions
  );
END;
$$;

-- 12.2 join_duel: Joiner accepts a waiting duel
-- Validates proximity, checks joiner hasn't played the duel questions, records as played.
CREATE OR REPLACE FUNCTION public.join_duel(
  p_duel_id uuid,
  p_user_lat double precision,
  p_user_lng double precision
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_duel record;
  v_stop record;
  v_dist double precision;
  v_question_ids uuid[];
  v_already_played int;
  v_clean_questions json;
  v_expires_at timestamptz;
BEGIN
  -- Lock the waiting duel so only one player can join.
  SELECT * INTO v_duel
  FROM public.duels
  WHERE id = p_duel_id
    AND status = 'waiting'
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel not found, already accepted, or expired.';
  END IF;

  -- Can't join own duel
  IF v_duel.initiator_id = v_user_id THEN
    RAISE EXCEPTION 'Cannot join your own duel.';
  END IF;

  -- Block entirely if user already played ANYTHING at this quiz stop
  IF EXISTS (SELECT 1 FROM public.user_played_quizzes WHERE user_id = v_user_id AND quiz_stop_id = v_duel.quiz_stop_id) THEN
    RAISE EXCEPTION 'You have already played at this quiz stop.';
  END IF;

  -- Lock and validate the stop. An expired stop cannot be revived by joining.
  SELECT * INTO v_stop
  FROM public.quiz_stops
  WHERE id = v_duel.quiz_stop_id
    AND expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quiz stop does not exist or has expired.';
  END IF;

  v_dist := ST_Distance(
    v_stop.location,
    ST_SetSRID(ST_MakePoint(p_user_lng, p_user_lat), 4326)::geography
  );
  IF v_dist > 50 THEN
    RAISE EXCEPTION 'Too far from stop (Distance: %). Required < 50m.', round(v_dist::numeric, 1);
  END IF;

  -- Extract question IDs from duel JSONB
  SELECT array_agg((q->>'id')::uuid)
  INTO v_question_ids
  FROM jsonb_array_elements(v_duel.questions) AS q;

  -- Check joiner hasn't already played any of these specific questions
  SELECT count(*) INTO v_already_played
  FROM public.user_played_quizzes upq
  WHERE upq.user_id = v_user_id AND upq.question_id = ANY(v_question_ids);

  IF v_already_played > 0 THEN
    RAISE EXCEPTION 'You have already played some of the duel questions.';
  END IF;

  -- Joining guarantees at least 2 minutes to finish. Keep the stop and duel
  -- synchronized so the duel can never remain active after the stop expires.
  v_expires_at := GREATEST(v_stop.expires_at, now() + interval '2 minutes');

  UPDATE public.quiz_stops
  SET expires_at = v_expires_at
  WHERE id = v_duel.quiz_stop_id;

  -- Record all 3 questions as played for the joiner
  INSERT INTO public.user_played_quizzes (user_id, question_id, quiz_stop_id, is_correct)
  SELECT v_user_id, unnest(v_question_ids), v_duel.quiz_stop_id, false
  ON CONFLICT (user_id, question_id) DO NOTHING;

  -- Increment quizzes_played by 3
  UPDATE public.profiles
  SET quizzes_played = quizzes_played + 3
  WHERE id = v_user_id;

  -- Update duel status
  UPDATE public.duels
  SET joiner_id = v_user_id,
      status = 'in_progress',
      expires_at = v_expires_at
  WHERE id = p_duel_id;

  -- Build clean questions (strip is_correct)
  SELECT json_agg(
    json_build_object(
      'id', dq->>'id',
      'text', dq->>'text',
      'answers', (
        SELECT json_agg(json_build_object('text', a->>'text', 'index', (idx - 1)::int))
        FROM jsonb_array_elements((dq->>'answers')::jsonb) WITH ORDINALITY AS t(a, idx)
      )
    )
  ) INTO v_clean_questions
  FROM jsonb_array_elements(v_duel.questions) AS dq;

  RETURN json_build_object(
    'duelId', p_duel_id,
    'status', 'in_progress',
    'categoryName', v_duel.category_name,
    'expiresAt', v_expires_at,
    'questions', v_clean_questions
  );
END;
$$;

-- 12.3 submit_duel_answer: Records a single duel answer with server-side verification
CREATE OR REPLACE FUNCTION public.submit_duel_answer(
  p_duel_id uuid,
  p_question_index int,
  p_answer_index int,
  p_time_ms int
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_duel record;
  v_question jsonb;
  v_answers jsonb;
  v_is_correct boolean := false;
  v_question_id uuid;
BEGIN
  -- Fetch duel
  SELECT * INTO v_duel FROM public.duels WHERE id = p_duel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel not found.';
  END IF;

  -- Verify user is participant
  IF v_duel.initiator_id != v_user_id AND v_duel.joiner_id != v_user_id THEN
    RAISE EXCEPTION 'You are not a participant of this duel.';
  END IF;

  -- Get question at the given index
  v_question := v_duel.questions -> p_question_index;
  IF v_question IS NULL THEN
    RAISE EXCEPTION 'Invalid question index.';
  END IF;

  v_question_id := (v_question ->> 'id')::uuid;
  v_answers := (v_question -> 'answers');

  -- Server-side answer verification
  IF p_answer_index >= 0 AND p_answer_index < jsonb_array_length(v_answers) THEN
    v_is_correct := COALESCE(
      (v_answers -> p_answer_index ->> 'is_correct')::boolean,
      (v_answers -> p_answer_index ->> 'isCorrect')::boolean,
      false
    );
  END IF;

  -- Insert answer record
  INSERT INTO public.duel_answers (duel_id, user_id, question_index, answer_index, is_correct, time_ms)
  VALUES (p_duel_id, v_user_id, p_question_index, p_answer_index, v_is_correct, p_time_ms)
  ON CONFLICT (duel_id, user_id, question_index) DO NOTHING;

  -- Also update user_played_quizzes correctness
  UPDATE public.user_played_quizzes
  SET is_correct = v_is_correct
  WHERE user_id = v_user_id AND question_id = v_question_id;

  RETURN json_build_object(
    'questionIndex', p_question_index,
    'isCorrect', v_is_correct
  );
END;
$$;

-- 12.4 complete_duel: Finalize a duel, compare scores, award rewards
-- Called after the last answer is submitted.
CREATE OR REPLACE FUNCTION public.complete_duel(
  p_duel_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_duel record;
  v_init_correct int := 0;
  v_init_count int := 0;
  v_init_time int := 0;
  v_join_correct int := 0;
  v_join_count int := 0;
  v_join_time int := 0;
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_xp int;
  v_winner_coins int;
  v_loser_xp int;
  v_loser_coins int;
  v_is_tie boolean := false;
  v_init_wins int := 0;
  v_join_wins int := 0;
  v_init_da record;
  v_join_da record;
  i int;

  v_init_profile record;
  v_join_profile record;
  v_rounds json;
BEGIN
  SELECT * INTO v_duel FROM public.duels WHERE id = p_duel_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel not found.';
  END IF;

  SELECT * INTO v_init_profile FROM public.profiles WHERE id = v_duel.initiator_id;
  IF v_duel.joiner_id IS NOT NULL THEN
    SELECT * INTO v_join_profile FROM public.profiles WHERE id = v_duel.joiner_id;
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'questionIndex', q.idx,
    'initiatorAnswer', COALESCE(da_init.answer_index, -1),
    'initiatorCorrect', COALESCE(da_init.is_correct, false),
    'initiatorTimeMs', COALESCE(da_init.time_ms, 0),
    'joinerAnswer', COALESCE(da_join.answer_index, -1),
    'joinerCorrect', COALESCE(da_join.is_correct, false),
    'joinerTimeMs', COALESCE(da_join.time_ms, 0)
  ) ORDER BY q.idx), '[]'::json) INTO v_rounds
  FROM (VALUES (0), (1), (2)) AS q(idx)
  LEFT JOIN public.duel_answers da_init ON da_init.duel_id = p_duel_id AND da_init.user_id = v_duel.initiator_id AND da_init.question_index = q.idx
  LEFT JOIN public.duel_answers da_join ON da_join.duel_id = p_duel_id AND da_join.user_id = v_duel.joiner_id AND da_join.question_index = q.idx;

  -- If no joiner yet
  IF v_duel.joiner_id IS NULL THEN
    -- If duel hasn't expired yet, the initiator is just finishing their run. Leave it waiting.
    IF v_duel.expires_at > now() THEN
      RETURN json_build_object(
        'duelId', p_duel_id,
        'status', 'waiting',
        'message', 'Waiting for opponent to join',
        'initiatorName', v_init_profile.username,
        'initiatorAvatarUrl', v_init_profile.avatar_url,
        'rounds', v_rounds
      );
    END IF;

    -- If it truly expired, give initiator partial rewards and close it.
    SELECT COALESCE(sum(CASE WHEN da.is_correct THEN 1 ELSE 0 END), 0)
    INTO v_init_correct
    FROM public.duel_answers da
    WHERE da.duel_id = p_duel_id AND da.user_id = v_duel.initiator_id;

    IF v_init_correct > 0 THEN
      UPDATE public.profiles SET xp = xp + v_init_correct, coins = coins + v_init_correct WHERE id = v_duel.initiator_id;
      INSERT INTO public.user_category_xp (user_id, category_name, xp)
      VALUES (v_duel.initiator_id, v_duel.category_name, v_init_correct)
      ON CONFLICT (user_id, category_name) DO UPDATE SET xp = public.user_category_xp.xp + v_init_correct;
    END IF;

    UPDATE public.duels SET status = 'expired' WHERE id = p_duel_id;

    RETURN json_build_object(
      'duelId', p_duel_id,
      'status', 'expired',
      'initiatorCorrect', v_init_correct,
      'initiatorTimeMs', 0,
      'joinerCorrect', 0,
      'joinerTimeMs', 0,
      'winnerId', v_duel.initiator_id,
      'initiatorXp', v_init_correct,
      'initiatorCoins', v_init_correct,
      'joinerXp', 0,
      'joinerCoins', 0,
      'initiatorName', v_init_profile.username,
      'initiatorAvatarUrl', v_init_profile.avatar_url,
      'rounds', v_rounds
    );
  END IF;

  -- Calculate scores and counts for both players
  SELECT COALESCE(sum(CASE WHEN da.is_correct THEN 1 ELSE 0 END), 0),
         COALESCE(sum(da.time_ms), 0),
         COUNT(*)
  INTO v_init_correct, v_init_time, v_init_count
  FROM public.duel_answers da
  WHERE da.duel_id = p_duel_id AND da.user_id = v_duel.initiator_id;

  SELECT COALESCE(sum(CASE WHEN da.is_correct THEN 1 ELSE 0 END), 0),
         COALESCE(sum(da.time_ms), 0),
         COUNT(*)
  INTO v_join_correct, v_join_time, v_join_count
  FROM public.duel_answers da
  WHERE da.duel_id = p_duel_id AND da.user_id = v_duel.joiner_id;

  IF (v_init_count < 3 OR v_join_count < 3) AND v_duel.expires_at > now() THEN
    RETURN json_build_object(
      'duelId', p_duel_id,
      'status', 'in_progress',
      'message', 'Waiting for opponent to finish',
      'initiatorName', v_init_profile.username,
      'initiatorAvatarUrl', v_init_profile.avatar_url,
      'joinerName', v_join_profile.username,
      'joinerAvatarUrl', v_join_profile.avatar_url,
      'rounds', v_rounds
    );
  END IF;

  IF v_join_count < 3 THEN
    IF v_init_correct = 0 THEN
      UPDATE public.duels SET status = 'completed' WHERE id = p_duel_id;
      RETURN json_build_object(
        'duelId', p_duel_id,
        'status', 'completed',
        'initiatorCorrect', v_init_correct,
        'initiatorTimeMs', v_init_time,
        'joinerCorrect', 0,
        'joinerTimeMs', 0,
        'winnerId', NULL,
        'isTie', true,
        'initiatorXp', 0,
        'initiatorCoins', 0,
        'joinerXp', 0,
        'joinerCoins', 0,
        'initiatorName', v_init_profile.username,
        'initiatorAvatarUrl', v_init_profile.avatar_url,
        'joinerName', v_join_profile.username,
        'joinerAvatarUrl', v_join_profile.avatar_url,
        'rounds', v_rounds
      );
    ELSE
      UPDATE public.profiles SET xp = xp + 5, coins = coins + 5 WHERE id = v_duel.initiator_id;
      INSERT INTO public.user_category_xp (user_id, category_name, xp)
      VALUES (v_duel.initiator_id, v_duel.category_name, 5)
      ON CONFLICT (user_id, category_name) DO UPDATE SET xp = public.user_category_xp.xp + 5;

      UPDATE public.duels SET status = 'completed' WHERE id = p_duel_id;
      RETURN json_build_object(
        'duelId', p_duel_id,
        'status', 'completed',
        'initiatorCorrect', v_init_correct,
        'initiatorTimeMs', v_init_time,
        'joinerCorrect', 0,
        'joinerTimeMs', 0,
        'winnerId', v_duel.initiator_id,
        'isTie', false,
        'initiatorXp', 5,
        'initiatorCoins', 5,
        'joinerXp', 0,
        'joinerCoins', 0,
        'initiatorName', v_init_profile.username,
        'initiatorAvatarUrl', v_init_profile.avatar_url,
        'joinerName', v_join_profile.username,
        'joinerAvatarUrl', v_join_profile.avatar_url,
        'rounds', v_rounds
      );
    END IF;
  END IF;

  IF v_init_count < 3 THEN
    IF v_join_correct = 0 THEN
      UPDATE public.duels SET status = 'completed' WHERE id = p_duel_id;
      RETURN json_build_object(
        'duelId', p_duel_id,
        'status', 'completed',
        'initiatorCorrect', 0,
        'initiatorTimeMs', 0,
        'joinerCorrect', v_join_correct,
        'joinerTimeMs', v_join_time,
        'winnerId', NULL,
        'isTie', true,
        'initiatorXp', 0,
        'initiatorCoins', 0,
        'joinerXp', 0,
        'joinerCoins', 0,
        'initiatorName', v_init_profile.username,
        'initiatorAvatarUrl', v_init_profile.avatar_url,
        'joinerName', v_join_profile.username,
        'joinerAvatarUrl', v_join_profile.avatar_url,
        'rounds', v_rounds
      );
    ELSE
      UPDATE public.profiles SET xp = xp + 5, coins = coins + 5 WHERE id = v_duel.joiner_id;
      INSERT INTO public.user_category_xp (user_id, category_name, xp)
      VALUES (v_duel.joiner_id, v_duel.category_name, 5)
      ON CONFLICT (user_id, category_name) DO UPDATE SET xp = public.user_category_xp.xp + 5;

      UPDATE public.duels SET status = 'completed' WHERE id = p_duel_id;
      RETURN json_build_object(
        'duelId', p_duel_id,
        'status', 'completed',
        'initiatorCorrect', 0,
        'initiatorTimeMs', 0,
        'joinerCorrect', v_join_correct,
        'joinerTimeMs', v_join_time,
        'winnerId', v_duel.joiner_id,
        'isTie', false,
        'initiatorXp', 0,
        'initiatorCoins', 0,
        'joinerXp', 5,
        'joinerCoins', 5,
        'initiatorName', v_init_profile.username,
        'initiatorAvatarUrl', v_init_profile.avatar_url,
        'joinerName', v_join_profile.username,
        'joinerAvatarUrl', v_join_profile.avatar_url,
        'rounds', v_rounds
      );
    END IF;
  END IF;

  -- Determine winner (Question by question)
  FOR i IN 0..2 LOOP
    SELECT * INTO v_init_da FROM public.duel_answers WHERE duel_id = p_duel_id AND user_id = v_duel.initiator_id AND question_index = i;
    SELECT * INTO v_join_da FROM public.duel_answers WHERE duel_id = p_duel_id AND user_id = v_duel.joiner_id AND question_index = i;

    IF (COALESCE(v_init_da.is_correct, false) AND NOT COALESCE(v_join_da.is_correct, false)) THEN
      v_init_wins := v_init_wins + 1;
    ELSIF (COALESCE(v_join_da.is_correct, false) AND NOT COALESCE(v_init_da.is_correct, false)) THEN
      v_join_wins := v_join_wins + 1;
    ELSIF (COALESCE(v_init_da.is_correct, false) AND COALESCE(v_join_da.is_correct, false)) THEN
      IF COALESCE(v_init_da.time_ms, 15000) < COALESCE(v_join_da.time_ms, 15000) THEN
        v_init_wins := v_init_wins + 1;
      ELSIF COALESCE(v_join_da.time_ms, 15000) < COALESCE(v_init_da.time_ms, 15000) THEN
        v_join_wins := v_join_wins + 1;
      END IF;
    END IF;
  END LOOP;

  IF v_init_wins > v_join_wins THEN
    v_winner_id := v_duel.initiator_id;
    v_loser_id := v_duel.joiner_id;
  ELSIF v_join_wins > v_init_wins THEN
    v_winner_id := v_duel.joiner_id;
    v_loser_id := v_duel.initiator_id;
  ELSE
    v_is_tie := true;
  END IF;

  IF v_is_tie THEN
    v_winner_xp := v_init_correct;
    v_winner_coins := v_init_correct;
    v_loser_xp := v_join_correct;
    v_loser_coins := v_join_correct;

    IF v_init_correct > 0 THEN
      UPDATE public.profiles SET xp = xp + v_init_correct, coins = coins + v_init_correct WHERE id = v_duel.initiator_id;
      INSERT INTO public.user_category_xp (user_id, category_name, xp)
      VALUES (v_duel.initiator_id, v_duel.category_name, v_init_correct)
      ON CONFLICT (user_id, category_name) DO UPDATE SET xp = public.user_category_xp.xp + v_init_correct;
    END IF;
    IF v_join_correct > 0 THEN
      UPDATE public.profiles SET xp = xp + v_join_correct, coins = coins + v_join_correct WHERE id = v_duel.joiner_id;
      INSERT INTO public.user_category_xp (user_id, category_name, xp)
      VALUES (v_duel.joiner_id, v_duel.category_name, v_join_correct)
      ON CONFLICT (user_id, category_name) DO UPDATE SET xp = public.user_category_xp.xp + v_join_correct;
    END IF;
  ELSE
    v_winner_xp := 5;
    v_winner_coins := 5;
    v_loser_xp := 0;
    v_loser_coins := 0;

    UPDATE public.profiles SET xp = xp + 5, coins = coins + 5 WHERE id = v_winner_id;
    INSERT INTO public.user_category_xp (user_id, category_name, xp)
    VALUES (v_winner_id, v_duel.category_name, 5)
    ON CONFLICT (user_id, category_name) DO UPDATE SET xp = public.user_category_xp.xp + 5;

  END IF;

  UPDATE public.duels SET status = 'completed' WHERE id = p_duel_id;

  RETURN json_build_object(
    'duelId', p_duel_id,
    'status', 'completed',
    'initiatorCorrect', v_init_correct,
    'initiatorTimeMs', v_init_time,
    'joinerCorrect', v_join_correct,
    'joinerTimeMs', v_join_time,
    'winnerId', CASE WHEN v_is_tie THEN NULL ELSE v_winner_id END,
    'isTie', v_is_tie,
    'initiatorXp', CASE WHEN v_is_tie THEN v_init_correct
                        WHEN v_winner_id = v_duel.initiator_id THEN 5 ELSE 0 END,
    'initiatorCoins', CASE WHEN v_is_tie THEN v_init_correct
                           WHEN v_winner_id = v_duel.initiator_id THEN 5 ELSE 0 END,
    'joinerXp', CASE WHEN v_is_tie THEN v_join_correct
                     WHEN v_winner_id = v_duel.joiner_id THEN 5 ELSE 0 END,
    'joinerCoins', CASE WHEN v_is_tie THEN v_join_correct
                        WHEN v_winner_id = v_duel.joiner_id THEN 5 ELSE 0 END,
    'initiatorName', v_init_profile.username,
    'initiatorAvatarUrl', v_init_profile.avatar_url,
    'joinerName', v_join_profile.username,
    'joinerAvatarUrl', v_join_profile.avatar_url,
    'rounds', v_rounds
  );
END;
$$;

-- 12.5 get_active_duels_for_stop: Returns waiting duels per category at a stop
CREATE OR REPLACE FUNCTION public.get_active_duels_for_stop(
  p_stop_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_agg(json_build_object(
    'duelId', d.id,
    'categoryName', d.category_name,
    'initiatorId', d.initiator_id,
    'initiatorName', p.username,
    'initiatorAvatarUrl', p.avatar_url,
    'status', d.status,
    'createdAt', d.created_at,
    'expiresAt', d.expires_at
  )) INTO v_result
  FROM public.duels d
  LEFT JOIN public.profiles p ON d.initiator_id = p.id
  WHERE d.quiz_stop_id = p_stop_id
    AND d.status = 'waiting'
    AND d.expires_at > now()
    AND d.initiator_id != auth.uid();

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- 12.6 check_and_resolve_my_duels: Background poll for completed duels
CREATE OR REPLACE FUNCTION public.check_and_resolve_my_duels()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_duel record;
  v_initiator_result json;
  v_joiner_result json;
  v_result json;
BEGIN
  FOR v_duel IN
    SELECT d.id FROM public.duels d
    WHERE d.initiator_id = v_user_id
      AND d.status = 'waiting'
      AND d.expires_at <= now()
  LOOP
    PERFORM public.complete_duel(v_duel.id);
  END LOOP;

  FOR v_duel IN
    SELECT d.id FROM public.duels d
    WHERE d.initiator_id = v_user_id
      AND d.status = 'in_progress'
      AND (SELECT count(*) FROM public.duel_answers da WHERE da.duel_id = d.id AND da.user_id = d.initiator_id) = 3
      AND (SELECT count(*) FROM public.duel_answers da WHERE da.duel_id = d.id AND da.user_id = d.joiner_id) = 3
  LOOP
    PERFORM public.complete_duel(v_duel.id);
  END LOOP;

  FOR v_duel IN
    SELECT d.id FROM public.duels d
    WHERE d.initiator_id = v_user_id
      AND d.status = 'in_progress'
      AND d.expires_at <= now()
  LOOP
    PERFORM public.complete_duel(v_duel.id);
  END LOOP;

  SELECT COALESCE(json_agg(json_build_object(
    'duelId', d.id,
    'status', d.status,
    'categoryName', d.category_name,
    'initiatorCorrect', w.init_correct,
    'initiatorTimeMs', w.init_time,
    'joinerCorrect', w.join_correct,
    'joinerTimeMs', w.join_time,
    'correctCount', w.init_correct,
    'isInitiator', true,
    'won', CASE
      WHEN d.status = 'expired' THEN true
      WHEN w.init_wins > w.join_wins THEN true
      ELSE false
    END,
    'winnerId', CASE
      WHEN d.status = 'expired' THEN d.initiator_id
      WHEN w.init_wins > w.join_wins THEN d.initiator_id
      WHEN w.join_wins > w.init_wins THEN d.joiner_id
      ELSE NULL
    END,
    'isTie', CASE
      WHEN d.status = 'completed' AND w.init_wins = w.join_wins THEN true
      ELSE false
    END,
    'initiatorName', p_init.username,
    'initiatorAvatarUrl', p_init.avatar_url,
    'joinerName', p_join.username,
    'joinerAvatarUrl', p_join.avatar_url,
    'rounds', w.rounds
  )), '[]'::json) INTO v_initiator_result
  FROM public.duels d
  LEFT JOIN public.profiles p_init ON d.initiator_id = p_init.id
  LEFT JOIN public.profiles p_join ON d.joiner_id = p_join.id
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE WHEN COALESCE(da_init.is_correct, false) THEN 1 ELSE 0 END) as init_correct,
      SUM(COALESCE(da_init.time_ms, 0)) as init_time,
      SUM(CASE WHEN COALESCE(da_join.is_correct, false) THEN 1 ELSE 0 END) as join_correct,
      SUM(COALESCE(da_join.time_ms, 0)) as join_time,
      SUM(CASE WHEN COALESCE(da_init.is_correct, false) AND NOT COALESCE(da_join.is_correct, false) THEN 1
               WHEN COALESCE(da_init.is_correct, false) AND COALESCE(da_join.is_correct, false) AND COALESCE(da_init.time_ms, 15000) < COALESCE(da_join.time_ms, 15000) THEN 1
               ELSE 0 END) as init_wins,
      SUM(CASE WHEN COALESCE(da_join.is_correct, false) AND NOT COALESCE(da_init.is_correct, false) THEN 1
               WHEN COALESCE(da_init.is_correct, false) AND COALESCE(da_join.is_correct, false) AND COALESCE(da_join.time_ms, 15000) < COALESCE(da_init.time_ms, 15000) THEN 1
               ELSE 0 END) as join_wins,
      COALESCE(json_agg(json_build_object(
        'questionIndex', q.idx,
        'initiatorAnswer', COALESCE(da_init.answer_index, -1),
        'initiatorCorrect', COALESCE(da_init.is_correct, false),
        'initiatorTimeMs', COALESCE(da_init.time_ms, 0),
        'joinerAnswer', COALESCE(da_join.answer_index, -1),
        'joinerCorrect', COALESCE(da_join.is_correct, false),
        'joinerTimeMs', COALESCE(da_join.time_ms, 0)
      ) ORDER BY q.idx), '[]'::json) as rounds
    FROM (VALUES (0), (1), (2)) AS q(idx)
    LEFT JOIN public.duel_answers da_init ON da_init.duel_id = d.id AND da_init.user_id = d.initiator_id AND da_init.question_index = q.idx
    LEFT JOIN public.duel_answers da_join ON da_join.duel_id = d.id AND da_join.user_id = d.joiner_id AND da_join.question_index = q.idx
  ) w ON true
  WHERE d.initiator_id = v_user_id
    AND d.status IN ('completed', 'expired')
    AND d.initiator_notified = false;

  SELECT COALESCE(json_agg(json_build_object(
    'duelId', d.id,
    'status', d.status,
    'categoryName', d.category_name,
    'initiatorCorrect', w.init_correct,
    'initiatorTimeMs', w.init_time,
    'joinerCorrect', w.join_correct,
    'joinerTimeMs', w.join_time,
    'correctCount', w.join_correct,
    'isInitiator', false,
    'won', CASE
      WHEN w.join_wins > w.init_wins THEN true
      ELSE false
    END,
    'winnerId', CASE
      WHEN w.init_wins > w.join_wins THEN d.initiator_id
      WHEN w.join_wins > w.init_wins THEN d.joiner_id
      ELSE NULL
    END,
    'isTie', CASE
      WHEN d.status = 'completed' AND w.init_wins = w.join_wins THEN true
      ELSE false
    END,
    'initiatorName', p_init.username,
    'initiatorAvatarUrl', p_init.avatar_url,
    'joinerName', p_join.username,
    'joinerAvatarUrl', p_join.avatar_url,
    'rounds', w.rounds
  )), '[]'::json) INTO v_joiner_result
  FROM public.duels d
  LEFT JOIN public.profiles p_init ON d.initiator_id = p_init.id
  LEFT JOIN public.profiles p_join ON d.joiner_id = p_join.id
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE WHEN COALESCE(da_init.is_correct, false) THEN 1 ELSE 0 END) as init_correct,
      SUM(COALESCE(da_init.time_ms, 0)) as init_time,
      SUM(CASE WHEN COALESCE(da_join.is_correct, false) THEN 1 ELSE 0 END) as join_correct,
      SUM(COALESCE(da_join.time_ms, 0)) as join_time,
      SUM(CASE WHEN COALESCE(da_init.is_correct, false) AND NOT COALESCE(da_join.is_correct, false) THEN 1
               WHEN COALESCE(da_init.is_correct, false) AND COALESCE(da_join.is_correct, false) AND COALESCE(da_init.time_ms, 15000) < COALESCE(da_join.time_ms, 15000) THEN 1
               ELSE 0 END) as init_wins,
      SUM(CASE WHEN COALESCE(da_join.is_correct, false) AND NOT COALESCE(da_init.is_correct, false) THEN 1
               WHEN COALESCE(da_init.is_correct, false) AND COALESCE(da_join.is_correct, false) AND COALESCE(da_join.time_ms, 15000) < COALESCE(da_init.time_ms, 15000) THEN 1
               ELSE 0 END) as join_wins,
      COALESCE(json_agg(json_build_object(
        'questionIndex', q.idx,
        'initiatorAnswer', COALESCE(da_init.answer_index, -1),
        'initiatorCorrect', COALESCE(da_init.is_correct, false),
        'initiatorTimeMs', COALESCE(da_init.time_ms, 0),
        'joinerAnswer', COALESCE(da_join.answer_index, -1),
        'joinerCorrect', COALESCE(da_join.is_correct, false),
        'joinerTimeMs', COALESCE(da_join.time_ms, 0)
      ) ORDER BY q.idx), '[]'::json) as rounds
    FROM (VALUES (0), (1), (2)) AS q(idx)
    LEFT JOIN public.duel_answers da_init ON da_init.duel_id = d.id AND da_init.user_id = d.initiator_id AND da_init.question_index = q.idx
    LEFT JOIN public.duel_answers da_join ON da_join.duel_id = d.id AND da_join.user_id = d.joiner_id AND da_join.question_index = q.idx
  ) w ON true
  WHERE d.joiner_id = v_user_id
    AND d.status = 'completed'
    AND d.joiner_notified = false;

  UPDATE public.duels SET initiator_notified = true WHERE initiator_id = v_user_id AND status IN ('completed', 'expired') AND initiator_notified = false;
  UPDATE public.duels SET joiner_notified = true WHERE joiner_id = v_user_id AND status = 'completed' AND joiner_notified = false;

  SELECT COALESCE(json_agg(elems), '[]'::json) INTO v_result
  FROM (
    SELECT json_array_elements(v_initiator_result) AS elems
    UNION ALL
    SELECT json_array_elements(v_joiner_result) AS elems
  ) sub;

  RETURN v_result;
END;
$$;

-- 12.7 get_my_duels: Returns all duels for the current user
CREATE OR REPLACE FUNCTION public.get_my_duels()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_initiator_result json;
  v_joiner_result json;
  v_result json;
BEGIN
  SELECT COALESCE(json_agg(json_build_object(
    'duelId', d.id,
    'status', d.status,
    'categoryName', d.category_name,
    'initiatorCorrect', w.init_correct,
    'initiatorTimeMs', w.init_time,
    'joinerCorrect', w.join_correct,
    'joinerTimeMs', w.join_time,
    'correctCount', w.init_correct,
    'isInitiator', true,
    'won', CASE
      WHEN d.status = 'expired' THEN true
      WHEN w.init_wins > w.join_wins THEN true
      ELSE false
    END,
    'winnerId', CASE
      WHEN d.status = 'expired' THEN d.initiator_id
      WHEN w.init_wins > w.join_wins THEN d.initiator_id
      WHEN w.join_wins > w.init_wins THEN d.joiner_id
      ELSE NULL
    END,
    'isTie', CASE
      WHEN d.status = 'completed' AND w.init_wins = w.join_wins THEN true
      ELSE false
    END,
    'initiatorName', p_init.username,
    'initiatorAvatarUrl', p_init.avatar_url,
    'joinerName', p_join.username,
    'joinerAvatarUrl', p_join.avatar_url,
    'rounds', w.rounds,
    'createdAt', d.created_at,
    'hasUnseenStories', NOT d.initiator_stories_viewed
  )), '[]'::json) INTO v_initiator_result
  FROM public.duels d
  LEFT JOIN public.profiles p_init ON d.initiator_id = p_init.id
  LEFT JOIN public.profiles p_join ON d.joiner_id = p_join.id
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE WHEN COALESCE(da_init.is_correct, false) THEN 1 ELSE 0 END) as init_correct,
      SUM(COALESCE(da_init.time_ms, 0)) as init_time,
      SUM(CASE WHEN COALESCE(da_join.is_correct, false) THEN 1 ELSE 0 END) as join_correct,
      SUM(COALESCE(da_join.time_ms, 0)) as join_time,
      SUM(CASE WHEN COALESCE(da_init.is_correct, false) AND NOT COALESCE(da_join.is_correct, false) THEN 1
               WHEN COALESCE(da_init.is_correct, false) AND COALESCE(da_join.is_correct, false) AND COALESCE(da_init.time_ms, 15000) < COALESCE(da_join.time_ms, 15000) THEN 1
               ELSE 0 END) as init_wins,
      SUM(CASE WHEN COALESCE(da_join.is_correct, false) AND NOT COALESCE(da_init.is_correct, false) THEN 1
               WHEN COALESCE(da_init.is_correct, false) AND COALESCE(da_join.is_correct, false) AND COALESCE(da_join.time_ms, 15000) < COALESCE(da_init.time_ms, 15000) THEN 1
               ELSE 0 END) as join_wins,
      COALESCE(json_agg(json_build_object(
        'questionIndex', q.idx,
        'initiatorAnswer', COALESCE(da_init.answer_index, -1),
        'initiatorCorrect', COALESCE(da_init.is_correct, false),
        'initiatorTimeMs', COALESCE(da_init.time_ms, 0),
        'joinerAnswer', COALESCE(da_join.answer_index, -1),
        'joinerCorrect', COALESCE(da_join.is_correct, false),
        'joinerTimeMs', COALESCE(da_join.time_ms, 0)
      ) ORDER BY q.idx), '[]'::json) as rounds
    FROM (VALUES (0), (1), (2)) AS q(idx)
    LEFT JOIN public.duel_answers da_init ON da_init.duel_id = d.id AND da_init.user_id = d.initiator_id AND da_init.question_index = q.idx
    LEFT JOIN public.duel_answers da_join ON da_join.duel_id = d.id AND da_join.user_id = d.joiner_id AND da_join.question_index = q.idx
  ) w ON true
  WHERE d.initiator_id = v_user_id;

  SELECT COALESCE(json_agg(json_build_object(
    'duelId', d.id,
    'status', d.status,
    'categoryName', d.category_name,
    'initiatorCorrect', w.init_correct,
    'initiatorTimeMs', w.init_time,
    'joinerCorrect', w.join_correct,
    'joinerTimeMs', w.join_time,
    'correctCount', w.join_correct,
    'isInitiator', false,
    'won', CASE
      WHEN w.join_wins > w.init_wins THEN true
      ELSE false
    END,
    'winnerId', CASE
      WHEN w.init_wins > w.join_wins THEN d.initiator_id
      WHEN w.join_wins > w.init_wins THEN d.joiner_id
      ELSE NULL
    END,
    'isTie', CASE
      WHEN d.status = 'completed' AND w.init_wins = w.join_wins THEN true
      ELSE false
    END,
    'initiatorName', p_init.username,
    'initiatorAvatarUrl', p_init.avatar_url,
    'joinerName', p_join.username,
    'joinerAvatarUrl', p_join.avatar_url,
    'rounds', w.rounds,
    'createdAt', d.created_at,
    'hasUnseenStories', NOT d.joiner_stories_viewed
  )), '[]'::json) INTO v_joiner_result
  FROM public.duels d
  LEFT JOIN public.profiles p_init ON d.initiator_id = p_init.id
  LEFT JOIN public.profiles p_join ON d.joiner_id = p_join.id
  LEFT JOIN LATERAL (
    SELECT
      SUM(CASE WHEN COALESCE(da_init.is_correct, false) THEN 1 ELSE 0 END) as init_correct,
      SUM(COALESCE(da_init.time_ms, 0)) as init_time,
      SUM(CASE WHEN COALESCE(da_join.is_correct, false) THEN 1 ELSE 0 END) as join_correct,
      SUM(COALESCE(da_join.time_ms, 0)) as join_time,
      SUM(CASE WHEN COALESCE(da_init.is_correct, false) AND NOT COALESCE(da_join.is_correct, false) THEN 1
               WHEN COALESCE(da_init.is_correct, false) AND COALESCE(da_join.is_correct, false) AND COALESCE(da_init.time_ms, 15000) < COALESCE(da_join.time_ms, 15000) THEN 1
               ELSE 0 END) as init_wins,
      SUM(CASE WHEN COALESCE(da_join.is_correct, false) AND NOT COALESCE(da_init.is_correct, false) THEN 1
               WHEN COALESCE(da_init.is_correct, false) AND COALESCE(da_join.is_correct, false) AND COALESCE(da_join.time_ms, 15000) < COALESCE(da_init.time_ms, 15000) THEN 1
               ELSE 0 END) as join_wins,
      COALESCE(json_agg(json_build_object(
        'questionIndex', q.idx,
        'initiatorAnswer', COALESCE(da_init.answer_index, -1),
        'initiatorCorrect', COALESCE(da_init.is_correct, false),
        'initiatorTimeMs', COALESCE(da_init.time_ms, 0),
        'joinerAnswer', COALESCE(da_join.answer_index, -1),
        'joinerCorrect', COALESCE(da_join.is_correct, false),
        'joinerTimeMs', COALESCE(da_join.time_ms, 0)
      ) ORDER BY q.idx), '[]'::json) as rounds
    FROM (VALUES (0), (1), (2)) AS q(idx)
    LEFT JOIN public.duel_answers da_init ON da_init.duel_id = d.id AND da_init.user_id = d.initiator_id AND da_init.question_index = q.idx
    LEFT JOIN public.duel_answers da_join ON da_join.duel_id = d.id AND da_join.user_id = d.joiner_id AND da_join.question_index = q.idx
  ) w ON true
  WHERE d.joiner_id = v_user_id;

  SELECT COALESCE(json_agg(elems ORDER BY (elems->>'createdAt')::timestamptz DESC), '[]'::json) INTO v_result
  FROM (
    SELECT json_array_elements(v_initiator_result) AS elems
    UNION ALL
    SELECT json_array_elements(v_joiner_result) AS elems
  ) sub;

  RETURN v_result;
END;
$$;

-- 12.8 mark_duel_stories_viewed: Sets stories_viewed flag to true
CREATE OR REPLACE FUNCTION public.mark_duel_stories_viewed(p_duel_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  UPDATE public.duels
  SET initiator_stories_viewed = true
  WHERE id = p_duel_id AND initiator_id = v_user_id;

  UPDATE public.duels
  SET joiner_stories_viewed = true
  WHERE id = p_duel_id AND joiner_id = v_user_id;
END;
$$;
