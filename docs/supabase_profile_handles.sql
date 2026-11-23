-- =============================================================
-- 핸들(@아이디)과 표시 이름 규칙
-- Supabase SQL Editor에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
-- - 표시 이름(profiles.username): 중복 허용. 화면에 보이는 이름.
-- - 핸들(profiles.handle): 중복 불가. 채널 주소(sofar.app/@handle), 멘션, 검색에 쓰는 고유 아이디.
--   · 영문 소문자·숫자·밑줄(_)·마침표(.) 3~20자, 마침표는 처음·끝·연속 불가, 숫자만으로는 불가
--   · 예약어(admin, sofar, settings 등)는 쓸 수 없다
--   · 가입하면 표시 이름으로 자동 생성되고(한글이면 listener1234 형식), 이메일은 쓰지 않는다(공개되므로)
--   · 바꾸기는 API(본인 확인)로만 가능하고 30일에 한 번. 버린 핸들은 30일 동안 다른 사람이 가져갈 수 없다(사칭 방지)
-- - 브라우저(anon·authenticated)에서 handle을 직접 바꾸려 하면 DB가 거절한다.
-- - 표시 이름은 보이지 않는 문자·연속 공백을 정리하고, 운영자로 보일 수 있는 이름을 거절한다.
-- =============================================================

-- 1. 컬럼 ---------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS handle TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS handle_changed_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_handle_key ON public.profiles (handle);

-- 바꾸기 전 핸들 (다른 사람이 곧바로 가져가 사칭하지 못하게 잠시 묶어 둔다)
CREATE TABLE IF NOT EXISTS public.profile_handle_history (
  handle      TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (handle, user_id)
);
-- 관리자가 초기화한 핸들은 본인도 30일 동안 다시 쓸 수 없다
ALTER TABLE public.profile_handle_history ADD COLUMN IF NOT EXISTS by_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profile_handle_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_handle_history FROM anon, authenticated;

-- 2. 규칙 ---------------------------------------------------------------
-- 핸들 문제 코드 (문제가 없으면 NULL). API도 이 코드를 그대로 안내 문구로 바꾼다.
CREATE OR REPLACE FUNCTION public.handle_problem(candidate TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN candidate IS NULL OR length(candidate) < 3 THEN 'too_short'
    WHEN length(candidate) > 20 THEN 'too_long'
    WHEN candidate !~ '^[a-z0-9._]+$' THEN 'invalid_chars'
    WHEN candidate ~ '^[.]' OR candidate ~ '[.]$' OR candidate ~ '[.][.]' THEN 'dot_position'
    WHEN candidate !~ '[a-z]' THEN 'no_letter'
    WHEN candidate LIKE 'sofar%' OR candidate LIKE 'croni%' OR candidate = ANY (ARRAY[
      'about', 'account', 'accounts', 'admin', 'administrator', 'api', 'app', 'auth', 'channel',
      'channels', 'chart', 'charts', 'explore', 'favorites', 'help', 'home', 'legal', 'library',
      'login', 'logout', 'manager', 'me', 'mod', 'moderator', 'my', 'myinfo', 'new', 'null',
      'official', 'playlist', 'playlists', 'privacy', 'queue', 'recommend', 'recommendation',
      'register', 'root', 'search', 'settings', 'share', 'signin', 'signup', 'staff', 'support',
      'system', 'team', 'terms', 'trending', 'undefined', 'user', 'users', 'www'
    ]) THEN 'reserved'
    ELSE NULL
  END
$$;

-- 표시 이름 정리: 보이지 않는 문자 제거, 공백 하나로, 앞뒤 공백 제거
CREATE OR REPLACE FUNCTION public.normalize_display_name(name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(coalesce(name, ''), '[\u0000-\u001F\u007F​-‏‪-‮⁠-⁤﻿]', '', 'g'),
    '\s+', ' ', 'g'
  ))
$$;

-- 표시 이름 문제 코드 (정리한 뒤의 값 기준)
CREATE OR REPLACE FUNCTION public.display_name_problem(name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN char_length(name) < 2 THEN 'too_short'
    WHEN char_length(name) > 20 THEN 'too_long'
    WHEN lower(replace(name, ' ', '')) ~ '(sofar|croni)'
      OR replace(name, ' ', '') ~ '(관리자|운영자|운영팀|소파공식)'
      OR lower(replace(name, ' ', '')) IN ('admin', 'administrator', 'official', 'moderator', 'staff')
      THEN 'reserved'
    ELSE NULL
  END
$$;

-- 3. 자동 생성 -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_handle(seed TEXT)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  base TEXT;
  candidate TEXT;
  tries INT := 0;
BEGIN
  base := lower(coalesce(seed, ''));
  base := regexp_replace(base, '[^a-z0-9._]+', '', 'g');
  base := regexp_replace(base, '[.]{2,}', '.', 'g');
  base := regexp_replace(base, '^[._]+', '');
  base := regexp_replace(left(base, 15), '[._]+$', '');
  IF handle_problem(base) IS NOT NULL THEN
    base := 'listener';
    candidate := base || lpad(floor(random() * 10000)::int::text, 4, '0');
  ELSE
    candidate := base;
  END IF;

  LOOP
    EXIT WHEN handle_problem(candidate) IS NULL
      AND NOT EXISTS (SELECT 1 FROM profiles WHERE handle = candidate)
      AND NOT EXISTS (
        SELECT 1 FROM profile_handle_history
        WHERE handle = candidate AND released_at > now() - interval '30 days'
      );
    tries := tries + 1;
    IF tries > 40 THEN
      candidate := 'listener' || substr(md5(random()::text), 1, 10);
    ELSE
      -- 자릿수를 점점 늘린다 (2자리 → 최대 5자리)
      candidate := base || floor(random() * power(10, least(2 + tries / 8, 5)))::int::text;
    END IF;
  END LOOP;
  RETURN candidate;
END;
$$;

-- 4. 브라우저에서 온 변경 막기 + 정리 ---------------------------------------
-- PostgREST 요청이면 request.jwt.claims에 역할이 담긴다. SQL Editor·cron은 비어 있다.
CREATE OR REPLACE FUNCTION public.request_from_client()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      nullif(current_setting('request.jwt.claim.role', true), '')
    ) IN ('anon', 'authenticated'),
    false
  )
$$;

-- SECURITY DEFINER: 브라우저 요청 중에도 RLS에 가려지지 않은 전체 핸들을 보고 중복을 피해야 한다
CREATE OR REPLACE FUNCTION public.profiles_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  problem TEXT;
BEGIN
  -- 표시 이름 정리·검사 (새로 쓰거나 바뀔 때만)
  IF NEW.username IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.username IS DISTINCT FROM OLD.username) THEN
    NEW.username := normalize_display_name(NEW.username);
    IF request_from_client() THEN
      problem := display_name_problem(NEW.username);
      IF problem IS NOT NULL THEN
        RAISE EXCEPTION 'display_name:%', problem USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- 브라우저가 보낸 핸들은 무시하고 서버 규칙으로 만든다
    IF request_from_client() OR NEW.handle IS NULL THEN
      NEW.handle := generate_handle(NEW.username);
      NEW.handle_changed_at := NULL;
    END IF;
  ELSIF request_from_client()
    AND (NEW.handle IS DISTINCT FROM OLD.handle OR NEW.handle_changed_at IS DISTINCT FROM OLD.handle_changed_at) THEN
    RAISE EXCEPTION 'handle:client_change_forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard ON public.profiles;
CREATE TRIGGER profiles_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard();

-- 형식 검사는 DB 제약으로도 건다 (예약어는 나중에 늘어날 수 있어 함수·API에서 검사)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_handle_format;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_handle_format CHECK (
  handle IS NULL OR (handle ~ '^[a-z0-9._]{3,20}$' AND handle !~ '^[.]|[.]$|[.][.]' AND handle ~ '[a-z]')
);

-- 5. API가 쓰는 함수 (service_role 전용) -----------------------------------
-- 핸들이 없으면 만들어 돌려준다. 프로필 행이 없으면 auth 계정 정보로 만든다.
CREATE OR REPLACE FUNCTION public.ensure_handle(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row RECORD;
BEGIN
  SELECT handle, handle_changed_at INTO row FROM profiles WHERE id = p_user;
  IF NOT FOUND THEN
    INSERT INTO profiles (id, username, email, updated_at)
    SELECT u.id,
           normalize_display_name(coalesce(
             u.raw_user_meta_data ->> 'display_name',
             u.raw_user_meta_data ->> 'full_name',
             u.raw_user_meta_data ->> 'name',
             '리스너'
           )),
           u.email,
           now()
    FROM auth.users u WHERE u.id = p_user
    ON CONFLICT (id) DO NOTHING;
    SELECT handle, handle_changed_at INTO row FROM profiles WHERE id = p_user;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('handle', NULL, 'changedAt', NULL);
    END IF;
  END IF;
  IF row.handle IS NULL THEN
    UPDATE profiles SET handle = generate_handle(username) WHERE id = p_user AND handle IS NULL
    RETURNING handle, handle_changed_at INTO row;
  END IF;
  RETURN jsonb_build_object('handle', row.handle, 'changedAt', row.handle_changed_at);
END;
$$;

-- 이 핸들을 p_user가 쓸 수 있는지 (문제 코드, 없으면 NULL)
CREATE OR REPLACE FUNCTION public.handle_unavailable_reason(p_handle TEXT, p_user UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    handle_problem(p_handle),
    CASE
      WHEN EXISTS (SELECT 1 FROM profiles WHERE handle = p_handle AND id IS DISTINCT FROM p_user) THEN 'taken'
      WHEN EXISTS (
        SELECT 1 FROM profile_handle_history
        WHERE handle = p_handle
          AND (user_id IS DISTINCT FROM p_user OR by_admin)
          AND released_at > now() - interval '30 days'
      ) THEN 'recently_used'
    END
  )
$$;

-- 핸들 바꾸기 (본인 확인은 API가 한다)
CREATE OR REPLACE FUNCTION public.change_handle(p_user UUID, p_handle TEXT, cooldown_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur RECORD;
  reason TEXT;
BEGIN
  SELECT handle, handle_changed_at INTO cur FROM profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_profile');
  END IF;
  IF cur.handle = p_handle THEN
    RETURN jsonb_build_object('ok', true, 'handle', cur.handle, 'changedAt', cur.handle_changed_at);
  END IF;
  IF cur.handle_changed_at IS NOT NULL AND cur.handle_changed_at > now() - make_interval(days => cooldown_days) THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'cooldown',
      'nextChangeAt', cur.handle_changed_at + make_interval(days => cooldown_days)
    );
  END IF;
  reason := handle_unavailable_reason(p_handle, p_user);
  IF reason IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', reason);
  END IF;

  IF cur.handle IS NOT NULL THEN
    INSERT INTO profile_handle_history (handle, user_id, released_at)
    VALUES (cur.handle, p_user, now())
    ON CONFLICT (handle, user_id) DO UPDATE SET released_at = excluded.released_at;
  END IF;
  UPDATE profiles SET handle = p_handle, handle_changed_at = now(), updated_at = now() WHERE id = p_user;
  RETURN jsonb_build_object('ok', true, 'handle', p_handle, 'changedAt', now());
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'taken');
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_handle(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_unavailable_reason(TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.change_handle(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_handle(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_handle(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_unavailable_reason(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.change_handle(UUID, TEXT, INT) TO service_role;
-- generate_handle은 소유자 권한으로 도는 트리거·함수 안에서만 쓴다
REVOKE ALL ON FUNCTION public.profiles_guard() FROM PUBLIC, anon, authenticated;

-- 관리자: 부적절한 핸들 초기화 (닉네임으로 새로 만들고, 사용자는 바로 다시 고를 수 있다)
-- 이전 핸들은 기록에 남겨 30일 동안 아무도(본인 포함) 쓰지 못하게 한다.
CREATE OR REPLACE FUNCTION public.admin_reset_handle(p_user UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur RECORD;
  next_handle TEXT;
BEGIN
  SELECT handle, username INTO cur FROM profiles WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_profile');
  END IF;
  IF cur.handle IS NOT NULL THEN
    INSERT INTO profile_handle_history (handle, user_id, released_at, by_admin)
    VALUES (cur.handle, p_user, now(), true)
    ON CONFLICT (handle, user_id) DO UPDATE SET released_at = excluded.released_at, by_admin = true;
  END IF;
  -- 같은 핸들이 다시 나오지 않게 잠시 비운 뒤 새로 만든다
  UPDATE profiles SET handle = NULL WHERE id = p_user;
  next_handle := generate_handle(cur.username);
  UPDATE profiles
  SET handle = next_handle, handle_changed_at = NULL, updated_at = now()
  WHERE id = p_user;
  RETURN jsonb_build_object('ok', true, 'handle', next_handle, 'previous', cur.handle);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_handle(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_handle(UUID) TO service_role;

-- 6. 기존 회원에게 핸들 채우기 (한 명씩 → 같은 핸들이 겹치지 않음) ------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, username FROM public.profiles WHERE handle IS NULL ORDER BY created_at LOOP
    UPDATE public.profiles SET handle = public.generate_handle(r.username) WHERE id = r.id;
  END LOOP;
END;
$$;

-- 7. 바꾸기 전 핸들은 30일 뒤 지운다 (개인정보 처리방침과 같음, 매일 04:30 KST) ----------
SELECT cron.schedule(
  'sofar-purge-handle-history',
  '30 19 * * *',
  $$ DELETE FROM public.profile_handle_history WHERE released_at < now() - interval '30 days'; $$
);

-- 확인 쿼리 예시 (실행할 필요 없음)
--   SELECT username, handle FROM profiles ORDER BY created_at;
