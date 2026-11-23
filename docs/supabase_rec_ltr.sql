-- =============================================================
-- 추천 3단계: 점수 가중치 자체를 학습 (learning to rank)
-- Supabase SQL Editor에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- 먼저 supabase_listening_events.sql, supabase_rec_bandit.sql 이 실행되어 있어야 한다.
--
-- 흐름
-- 1) 추천을 내보낼 때 서버가 곡마다 점수 재료(features)와 위치를 recommendation_serves에 남긴다.
--    (클라이언트가 보낸 값은 쓰지 않는다 → 학습 데이터를 조작할 수 없음)
-- 2) 학습할 때 '실제로 화면에 보인 곡(impression)'만 골라, 눌러서 30초 이상 들었는지를 정답으로 쓴다.
-- 3) API가 로지스틱 회귀로 가중치를 학습하고, 검증 성능이 더 좋을 때만 rec_model_weights에 새 버전으로 켠다.
-- =============================================================

-- 1. 서버가 내보낸 추천과 점수 재료 -------------------------------------
CREATE TABLE IF NOT EXISTS public.recommendation_serves (
  request_id  TEXT NOT NULL,
  item_id     TEXT NOT NULL,          -- track_key
  viewer_key  TEXT NOT NULL,          -- 'u:<user_id>' 또는 'c:<client_id>'
  algo        TEXT NOT NULL,
  arm         TEXT,
  position    SMALLINT NOT NULL,      -- 노래 탭에서의 순서 (0부터)
  features    JSONB NOT NULL,         -- { cooc, sim, artist, pop } (0~1)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, item_id)
);
CREATE INDEX IF NOT EXISTS recommendation_serves_time_idx ON public.recommendation_serves (created_at DESC);
ALTER TABLE public.recommendation_serves ENABLE ROW LEVEL SECURITY;
-- 정책 없음: service_role(API 서버)만 읽고 쓴다.

-- 2. 학습된 가중치 (버전별, 켜진 것 하나만 사용) ---------------------------
CREATE TABLE IF NOT EXISTS public.rec_model_weights (
  id           BIGSERIAL PRIMARY KEY,
  version      TEXT NOT NULL UNIQUE,  -- 예: ltr-2026-11-24T03-00
  weights      JSONB NOT NULL,        -- { bias, cooc, sim, artist, pop, ... }
  metrics      JSONB NOT NULL,        -- { auc, baselineAuc, logloss, samples, positives }
  active       BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS rec_model_weights_one_active
  ON public.rec_model_weights (active) WHERE active;
ALTER TABLE public.rec_model_weights ENABLE ROW LEVEL SECURITY;

-- 3. 학습 데이터 ---------------------------------------------------------
-- - 실제로 보인(impression) 곡만 사용
-- - 정답(label) = 그 추천에서 눌러 30초 이상 감상
-- - 같은 사람·곡·날은 1행, 한 사람이 학습을 좌우하지 않도록 사람당 최근 per_viewer_cap행까지만
CREATE OR REPLACE FUNCTION public.get_ltr_training_rows(
  window_days INT DEFAULT 30,
  per_viewer_cap INT DEFAULT 200
)
RETURNS TABLE (features JSONB, arm TEXT, position SMALLINT, label INT, viewer_key TEXT, day DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH shown AS (
    SELECT DISTINCT ON (s.viewer_key, s.item_id, (s.created_at AT TIME ZONE 'Asia/Seoul')::date)
      s.request_id, s.item_id, s.viewer_key, s.features, s.arm, s.position,
      (s.created_at AT TIME ZONE 'Asia/Seoul')::date AS day,
      s.created_at
    FROM recommendation_serves s
    WHERE s.created_at > now() - make_interval(days => window_days)
      AND EXISTS (
        SELECT 1 FROM recommendation_events r
        WHERE r.request_id = s.request_id
          AND r.item_id = s.item_id
          AND r.event = 'impression'
      )
    ORDER BY s.viewer_key, s.item_id, (s.created_at AT TIME ZONE 'Asia/Seoul')::date, s.created_at
  ),
  labeled AS (
    SELECT
      sh.*,
      CASE WHEN EXISTS (
        SELECT 1 FROM play_events p
        WHERE p.rec_request_id = sh.request_id
          AND p.track_key = sh.item_id
          AND p.listened_sec >= 30
      ) THEN 1 ELSE 0 END AS label,
      row_number() OVER (PARTITION BY sh.viewer_key ORDER BY sh.created_at DESC) AS rn
    FROM shown sh
  )
  SELECT features, arm, position, label, viewer_key, day
  FROM labeled
  WHERE rn <= per_viewer_cap;
$$;

REVOKE ALL ON FUNCTION public.get_ltr_training_rows(INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ltr_training_rows(INT, INT) TO service_role;

-- 4. 보관 기간: 추천 기록은 2년 후 자동 파기 (개인정보 처리방침 '추천 이용 기록'과 같음) ----
SELECT cron.schedule(
  'sofar-purge-recommendation-serves',
  '50 18 * * *', -- 매일 03:50 (한국 시간)
  $$ DELETE FROM public.recommendation_serves WHERE created_at < now() - interval '2 years'; $$
);

-- 5. 확인 쿼리 예시 (실행할 필요 없음) -----------------------------------
--   SELECT version, active, metrics, created_at FROM rec_model_weights ORDER BY created_at DESC LIMIT 5;
