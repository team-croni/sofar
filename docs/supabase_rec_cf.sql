-- =============================================================
-- 추천 4단계: 협업 필터링 — "이 곡을 들은 리스너들이 함께 들은 곡"
-- Supabase SQL Editor에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- 먼저 supabase_listening_events.sql, supabase_rec_bandit.sql, supabase_rec_ltr.sql 이 실행되어 있어야 한다.
--
-- - 곡 사이 유사도(코사인)를 감상 기록으로 계산해 rec_item_neighbors에 곡마다 상위 이웃을 저장한다.
-- - 매일 새벽 DB가 다시 계산하고, API는 필요한 곡의 이웃만 읽는다.
-- - 결과 테이블에는 개인을 알아볼 수 있는 값이 없다 (곡과 곡 사이 점수만).
--
-- 어뷰징 방지
-- - 30초 이상 듣고 넘기지 않은 재생만 '좋아함'으로 센다.
-- - 한 사람(회원 또는 브라우저)은 최근 곡 per_viewer_cap개까지만 반영한다.
-- - 로그인하지 않은 브라우저는 0.5명으로 센다 (브라우저 ID는 쉽게 새로 만들 수 있으므로).
-- - 두 곡을 함께 들은 사람이 min_support명 이상일 때만 이웃으로 인정한다.
-- =============================================================

-- 1. 추천 이벤트·추천 기록의 팔에 'cf' 추가 -----------------------------
ALTER TABLE public.recommendation_events DROP CONSTRAINT IF EXISTS recommendation_events_arm_check;
ALTER TABLE public.recommendation_events ADD CONSTRAINT recommendation_events_arm_check
  CHECK (arm IS NULL OR arm IN ('cooc', 'similar', 'artist', 'popular', 'cf'));

-- 2. 곡별 이웃 --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rec_item_neighbors (
  item_key          TEXT NOT NULL,      -- 기준 곡 track_key
  neighbor_key      TEXT NOT NULL,      -- 함께 들은 곡 track_key
  score             REAL NOT NULL,      -- 코사인 유사도 (0~1)
  support           REAL NOT NULL,      -- 두 곡을 모두 좋아한 사람 수 (비회원 0.5)
  neighbor_title    TEXT,
  neighbor_artist   TEXT,
  neighbor_video_id TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_key, neighbor_key)
);
CREATE INDEX IF NOT EXISTS rec_item_neighbors_item_score_idx
  ON public.rec_item_neighbors (item_key, score DESC);
ALTER TABLE public.rec_item_neighbors ENABLE ROW LEVEL SECURITY;
-- 정책 없음: service_role(API 서버)만 읽는다.

-- 3. 다시 계산하는 함수 ------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebuild_item_neighbors(
  window_days INT DEFAULT 90,
  per_viewer_cap INT DEFAULT 150,
  min_support REAL DEFAULT 2,
  top_k INT DEFAULT 30
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted INT;
BEGIN
  -- 사람별 좋아한 곡 (최근 per_viewer_cap개)
  CREATE TEMP TABLE _cf_likes ON COMMIT DROP AS
  SELECT viewer, track_key, weight
  FROM (
    SELECT
      g.viewer,
      g.track_key,
      g.weight,
      row_number() OVER (PARTITION BY g.viewer ORDER BY g.last_at DESC) AS rn
    FROM (
      SELECT
        CASE WHEN e.user_id IS NOT NULL THEN 'u:' || e.user_id::text ELSE 'c:' || e.client_id END AS viewer,
        e.track_key,
        CASE WHEN e.user_id IS NOT NULL THEN 1.0 ELSE 0.5 END AS weight,
        max(e.started_at) AS last_at
      FROM play_events e
      WHERE e.started_at > now() - make_interval(days => window_days)
        AND e.listened_sec >= 30
        AND NOT e.is_skip
      GROUP BY 1, 2, 3
    ) g
  ) ranked
  WHERE rn <= per_viewer_cap;

  -- 곡별 좋아한 사람 수
  CREATE TEMP TABLE _cf_item ON COMMIT DROP AS
  SELECT track_key, sum(weight) AS n
  FROM _cf_likes
  GROUP BY track_key;

  -- 두 곡을 모두 좋아한 사람 수 → 코사인 유사도 → 곡마다 상위 top_k
  CREATE TEMP TABLE _cf_pairs ON COMMIT DROP AS
  SELECT item_key, neighbor_key, score, support
  FROM (
    SELECT
      p.item_key,
      p.neighbor_key,
      (p.support / sqrt(a.n * b.n))::real AS score,
      p.support::real AS support,
      row_number() OVER (PARTITION BY p.item_key ORDER BY p.support / sqrt(a.n * b.n) DESC, p.support DESC) AS rk
    FROM (
      SELECT x.track_key AS item_key, y.track_key AS neighbor_key, sum(least(x.weight, y.weight)) AS support
      FROM _cf_likes x
      JOIN _cf_likes y ON y.viewer = x.viewer AND y.track_key <> x.track_key
      GROUP BY 1, 2
      HAVING sum(least(x.weight, y.weight)) >= min_support
    ) p
    JOIN _cf_item a ON a.track_key = p.item_key
    JOIN _cf_item b ON b.track_key = p.neighbor_key
  ) scored
  WHERE rk <= top_k;

  -- 이웃 곡의 제목·아티스트·영상 (가장 최근 재생 기준)
  DELETE FROM rec_item_neighbors;
  INSERT INTO rec_item_neighbors (item_key, neighbor_key, score, support, neighbor_title, neighbor_artist, neighbor_video_id, updated_at)
  SELECT p.item_key, p.neighbor_key, p.score, p.support, m.title, m.artist, m.video_id, now()
  FROM _cf_pairs p
  LEFT JOIN LATERAL (
    SELECT e.title, e.artist, e.video_id
    FROM play_events e
    WHERE e.track_key = p.neighbor_key
    ORDER BY e.started_at DESC
    LIMIT 1
  ) m ON true;

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_item_neighbors(INT, INT, REAL, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_item_neighbors(INT, INT, REAL, INT) TO service_role;

-- 4. 매일 다시 계산 (한국 시간 04:10) -------------------------------------
SELECT cron.schedule(
  'sofar-rebuild-item-neighbors',
  '10 19 * * *',
  $$ SELECT public.rebuild_item_neighbors(); $$
);

-- 처음 한 번 바로 계산
SELECT public.rebuild_item_neighbors();

-- 확인 쿼리 예시 (실행할 필요 없음)
--   SELECT count(*), count(DISTINCT item_key), max(updated_at) FROM rec_item_neighbors;
