-- =============================================================
-- 연령·성별 (선택 입력) — 통계와 추천 개선에만 사용
-- Supabase SQL Editor에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
-- - profiles는 다른 사람의 닉네임·아바타를 보여 주는 데 쓰이므로, 연령·성별은 별도 테이블에 둔다.
-- - RLS 정책이 없어 브라우저(anon·authenticated)에서는 읽을 수도 쓸 수도 없다.
--   본인 확인을 거친 API 서버(service_role)만 읽고 쓴다: GET/PUT /api/me/demographics
-- - 통계는 연령대(10살 단위)와 성별로 묶어서만 본다.
-- - 회원 탈퇴 시 auth 계정과 함께 지워진다 (ON DELETE CASCADE + API에서도 직접 삭제).
-- =============================================================

CREATE TABLE IF NOT EXISTS public.profile_demographics (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  birth_year  SMALLINT CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100),
  gender      TEXT CHECK (gender IS NULL OR gender IN ('female', 'male', 'other')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profile_demographics ENABLE ROW LEVEL SECURITY;
-- 정책 없음: service_role(API 서버)만 접근.
REVOKE ALL ON public.profile_demographics FROM anon, authenticated;

-- 예전 초안(supabase_listening_events.sql 4번)에서 profiles에 만든 컬럼은 수집한 적이 없으므로 지운다.
-- (profiles는 다른 사람에게 보일 수 있는 테이블이라 여기에 두지 않는다)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS birth_year;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS gender;

-- 통계 쿼리 예시 (실행할 필요 없음)
--   SELECT (extract(year FROM e.started_at)::int - d.birth_year) / 10 * 10 AS age_group,
--          d.gender, e.title, e.artist, count(*) AS plays
--   FROM play_events e JOIN profile_demographics d ON d.user_id = e.user_id
--   WHERE d.birth_year IS NOT NULL AND NOT e.is_skip
--   GROUP BY 1, 2, 3, 4 ORDER BY plays DESC LIMIT 50;
