-- =============================================================
-- 추천 성과 대시보드 (관리자 화면용 집계)
-- Supabase SQL Editor에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- 먼저 supabase_listening_events.sql ~ supabase_rec_cf.sql 이 실행되어 있어야 한다.
--
-- 세는 기준은 밴딧·가중치 학습과 같다: 같은 사람·같은 곡·같은 날은 노출 1회, 클릭 1회, 감상 1회.
-- 감상 = 그 추천에서 눌러 30초 이상 들음.
-- 버전(algo)은 '버전:모델' 형식이면 앞부분만 묶는다 (예: hybrid-v3-ltr:ltr-... → hybrid-v3-ltr).
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_rec_dashboard(window_days INT DEFAULT 14)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      split_part(r.algo, ':', 1) AS variant,
      r.event,
      r.request_id,
      r.item_id,
      r.arm,
      coalesce(r.user_id::text, r.client_id) AS viewer,
      (r.created_at AT TIME ZONE 'Asia/Seoul')::date AS day
    FROM recommendation_events r
    WHERE r.item_type = 'track'
      AND r.created_at > now() - make_interval(days => window_days)
  ),
  shown AS (
    SELECT DISTINCT variant, viewer, item_id, day FROM base WHERE event = 'impression'
  ),
  clicked AS (
    SELECT DISTINCT variant, viewer, item_id, day, request_id FROM base WHERE event = 'click'
  ),
  good AS (
    SELECT DISTINCT c.variant, c.viewer, c.item_id, c.day
    FROM clicked c
    JOIN play_events p
      ON p.rec_request_id = c.request_id
     AND p.track_key = c.item_id
     AND p.listened_sec >= 30
  ),
  variants AS (
    SELECT
      s.variant,
      count(*)::int AS impressions,
      count(DISTINCT s.viewer)::int AS viewers,
      (SELECT count(*) FROM (SELECT DISTINCT variant, viewer, item_id, day FROM clicked) c WHERE c.variant = s.variant)::int AS clicks,
      (SELECT count(*) FROM good g WHERE g.variant = s.variant)::int AS good_plays
    FROM shown s
    GROUP BY s.variant
  ),
  daily AS (
    SELECT
      s.variant,
      s.day,
      count(*)::int AS impressions,
      (SELECT count(*) FROM good g WHERE g.variant = s.variant AND g.day = s.day)::int AS good_plays
    FROM shown s
    GROUP BY s.variant, s.day
  ),
  served AS (
    SELECT coalesce(arm, 'unknown') AS arm, count(*)::int AS served
    FROM recommendation_serves
    WHERE created_at > now() - interval '7 days'
    GROUP BY 1
  ),
  training AS (
    SELECT count(*)::int AS samples, coalesce(sum(label), 0)::int AS positives
    FROM get_ltr_training_rows(30, 200)
  )
  SELECT jsonb_build_object(
    'windowDays', window_days,
    'variants', coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.variant) FROM variants v), '[]'::jsonb),
    'daily', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day, d.variant) FROM daily d), '[]'::jsonb),
    'arms', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'arm', a.arm,
        'impressions', a.impressions,
        'rewards', a.rewards,
        'served7d', coalesce((SELECT served FROM served WHERE served.arm = a.arm), 0)
      ) ORDER BY a.arm)
      FROM get_rec_arm_stats(window_days) a
    ), '[]'::jsonb),
    'served7d', coalesce((SELECT jsonb_object_agg(arm, served) FROM served), '{}'::jsonb),
    'training', (SELECT to_jsonb(t) FROM training t),
    'models', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'version', m.version, 'active', m.active, 'metrics', m.metrics,
        'weights', m.weights, 'createdAt', m.created_at
      ) ORDER BY m.created_at DESC)
      FROM (SELECT * FROM rec_model_weights ORDER BY created_at DESC LIMIT 5) m
    ), '[]'::jsonb),
    'neighbors', (
      SELECT jsonb_build_object(
        'rows', count(*)::int,
        'items', count(DISTINCT item_key)::int,
        'updatedAt', max(updated_at)
      )
      FROM rec_item_neighbors
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_rec_dashboard(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_rec_dashboard(INT) TO service_role;
