-- =============================================================
-- 추천 2단계: 밴딧(Thompson sampling)으로 후보 출처 비율 자동 조정
-- Supabase SQL Editor에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- 먼저 supabase_listening_events.sql 이 실행되어 있어야 한다.
--
-- '팔(arm)' = 추천 곡이 어느 후보 출처에서 왔는지
--   cooc    좋아한 곡과 같은 플레이리스트에 함께 담긴 곡
--   similar 좋아한 곡과 비슷한 곡 (Last.fm)
--   artist  자주 듣는 아티스트의 곡
--   popular 지금 sofar에서 인기 있는 곡
-- 보상 = 추천에서 눌러 30초 이상 들은 경우
-- =============================================================

-- 1. 추천 이벤트에 팔 기록 ----------------------------------------------
ALTER TABLE public.recommendation_events ADD COLUMN IF NOT EXISTS arm TEXT
  CHECK (arm IS NULL OR arm IN ('cooc', 'similar', 'artist', 'popular'));

CREATE INDEX IF NOT EXISTS recommendation_events_arm_time_idx
  ON public.recommendation_events (arm, created_at DESC) WHERE arm IS NOT NULL;

-- 2. 팔별 노출·보상 집계 ------------------------------------------------
-- 어뷰징·중복 방지: 같은 사람(회원 또는 브라우저)·같은 곡·같은 날은 노출 1회, 보상 1회로만 센다.
-- 그래서 새로고침을 반복하거나 같은 곡을 여러 번 눌러도 수치가 부풀지 않는다.
CREATE OR REPLACE FUNCTION public.get_rec_arm_stats(window_days INT DEFAULT 14)
RETURNS TABLE (arm TEXT, impressions INT, rewards INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH shown AS (
    SELECT DISTINCT
      r.arm,
      coalesce(r.user_id::text, r.client_id) AS viewer,
      r.item_id,
      (r.created_at AT TIME ZONE 'Asia/Seoul')::date AS day
    FROM recommendation_events r
    WHERE r.event = 'impression'
      AND r.item_type = 'track'
      AND r.arm IS NOT NULL
      AND r.created_at > now() - make_interval(days => window_days)
  ),
  rewarded AS (
    SELECT DISTINCT
      r.arm,
      coalesce(r.user_id::text, r.client_id) AS viewer,
      r.item_id,
      (r.created_at AT TIME ZONE 'Asia/Seoul')::date AS day
    FROM recommendation_events r
    JOIN play_events p
      ON p.rec_request_id = r.request_id
     AND p.track_key = r.item_id
     AND p.listened_sec >= 30
    WHERE r.event = 'click'
      AND r.item_type = 'track'
      AND r.arm IS NOT NULL
      AND r.created_at > now() - make_interval(days => window_days)
  )
  SELECT
    s.arm,
    count(*)::int AS impressions,
    (SELECT count(*)::int FROM rewarded w WHERE w.arm = s.arm) AS rewards
  FROM shown s
  GROUP BY s.arm;
$$;

REVOKE ALL ON FUNCTION public.get_rec_arm_stats(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rec_arm_stats(INT) TO service_role;

-- 3. 성과 비교 쿼리 예시 (실행할 필요 없음) --------------------------------
-- 알고리즘 버전별 클릭률과 '30초 이상 감상' 비율
--   SELECT r.algo,
--          count(DISTINCT (r.request_id, r.item_id)) FILTER (WHERE r.event = 'impression') AS impressions,
--          count(DISTINCT (r.request_id, r.item_id)) FILTER (WHERE r.event = 'click') AS clicks,
--          count(DISTINCT (p.rec_request_id, p.track_key)) FILTER (WHERE p.listened_sec >= 30) AS good_plays
--   FROM recommendation_events r
--   LEFT JOIN play_events p ON p.rec_request_id = r.request_id AND p.track_key = r.item_id
--   WHERE r.created_at > now() - interval '14 days'
--   GROUP BY r.algo;
