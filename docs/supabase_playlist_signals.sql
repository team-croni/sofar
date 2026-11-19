-- =============================================================
-- 플레이리스트 좋아요·조회·공유 유입, 추천 '관심 없음' 스키마
-- Supabase SQL Editor에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
-- 어뷰징 방지 원칙
-- - 쓰기는 API 서버(service_role)만 한다. 모든 테이블에 공개 정책이 없다.
-- - 같은 사람·같은 대상은 기본키로 한 번만 저장된다 (좋아요 1개, 조회는 하루 1회, 공유 유입은 공유 링크당 1회).
-- - (응원(hype) 기능은 좋아요와 역할이 겹쳐 빼기로 했다. 이전 초안으로 만든 테이블이 있으면 지운다.)
DROP TABLE IF EXISTS public.playlist_hypes;
-- - 본인 플레이리스트에 대한 반응·조회는 API에서 거르고, 집계 함수에서도 한 번 더 뺀다.
-- - 순위에는 원본 횟수 대신 집계 함수(get_playlist_signal_stats)의 '사람 수'만 쓴다.
-- =============================================================

-- 1. 좋아요 (로그인 계정당 플레이리스트별 1개) ---------------------------
CREATE TABLE IF NOT EXISTS public.playlist_likes (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, playlist_id)
);
CREATE INDEX IF NOT EXISTS playlist_likes_playlist_idx ON public.playlist_likes (playlist_id);
ALTER TABLE public.playlist_likes ENABLE ROW LEVEL SECURITY;

-- 2. 조회: 같은 사람(회원 또는 브라우저)은 하루 1회 ---------------------------
CREATE TABLE IF NOT EXISTS public.playlist_views (
  viewer_key  TEXT NOT NULL,          -- 'u:<user_id>' 또는 'c:<client_id>'
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source      TEXT,                   -- home | recommend | share_link | search | unknown
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer_key, playlist_id, day)
);
CREATE INDEX IF NOT EXISTS playlist_views_playlist_day_idx ON public.playlist_views (playlist_id, day);
ALTER TABLE public.playlist_views ENABLE ROW LEVEL SECURITY;

-- 3. 공유 링크와 유입 ----------------------------------------------------
-- 링크 복사 횟수가 아니라, 그 링크로 실제 들어온 '다른 사람' 수를 센다.
CREATE TABLE IF NOT EXISTS public.playlist_shares (
  id               TEXT PRIMARY KEY,  -- 링크에 붙는 무작위 코드 (?s=)
  playlist_id      UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  sharer_key       TEXT NOT NULL,     -- 'u:<user_id>' 또는 'c:<client_id>'
  sharer_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS playlist_shares_playlist_idx ON public.playlist_shares (playlist_id);
ALTER TABLE public.playlist_shares ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.playlist_share_visits (
  share_id    TEXT NOT NULL REFERENCES public.playlist_shares(id) ON DELETE CASCADE,
  visitor_key TEXT NOT NULL,
  playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (share_id, visitor_key)
);
CREATE INDEX IF NOT EXISTS playlist_share_visits_playlist_idx ON public.playlist_share_visits (playlist_id, created_at);
ALTER TABLE public.playlist_share_visits ENABLE ROW LEVEL SECURITY;

-- 4. 추천 '관심 없음' (본인 추천에만 영향) ----------------------------------
CREATE TABLE IF NOT EXISTS public.recommendation_feedback (
  viewer_key  TEXT NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type   TEXT NOT NULL CHECK (item_type IN ('track', 'curated', 'shared')),
  item_id     TEXT NOT NULL,          -- track_key 또는 플레이리스트 ID
  artist      TEXT,
  feedback    TEXT NOT NULL DEFAULT 'not_interested' CHECK (feedback IN ('not_interested')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (viewer_key, item_type, item_id)
);
ALTER TABLE public.recommendation_feedback ENABLE ROW LEVEL SECURITY;

-- 5. 집계 함수: 순위·추천에 쓰는 '믿을 수 있는 사람 수' ---------------------
-- - 본인 반응 제외
-- - 좋아요는 가입 3일 이상 계정만 센다 (급조한 계정으로 부풀리기 방지)
-- - 조회·재생·공유 유입은 최근 30일, 최근 좋아요는 14일 (새 플레이리스트를 먼저 띄우는 데 사용)
-- 반환 형식이 바뀐 적이 있어 먼저 지우고 다시 만든다
DROP FUNCTION IF EXISTS public.get_playlist_signal_stats(UUID[]);
CREATE FUNCTION public.get_playlist_signal_stats(playlist_ids UUID[] DEFAULT NULL)
RETURNS TABLE (
  playlist_id UUID,
  likes INT,
  likes_14d INT,
  viewers_30d INT,
  listeners_30d INT,
  share_visitors_30d INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH targets AS (
    SELECT p.id, p.user_id
    FROM playlists p
    WHERE p.is_public = true
      AND (playlist_ids IS NULL OR p.id = ANY(playlist_ids))
  )
  SELECT
    t.id,
    (SELECT count(*)::int FROM playlist_likes l
       JOIN auth.users u ON u.id = l.user_id
      WHERE l.playlist_id = t.id
        AND l.user_id IS DISTINCT FROM t.user_id
        AND u.created_at < now() - interval '3 days'),
    (SELECT count(*)::int FROM playlist_likes l
       JOIN auth.users u ON u.id = l.user_id
      WHERE l.playlist_id = t.id
        AND l.user_id IS DISTINCT FROM t.user_id
        AND u.created_at < now() - interval '3 days'
        AND l.created_at > now() - interval '14 days'),
    (SELECT count(DISTINCT v.viewer_key)::int FROM playlist_views v
      WHERE v.playlist_id = t.id
        AND v.user_id IS DISTINCT FROM t.user_id
        AND v.day > (now() - interval '30 days')::date),
    (SELECT count(DISTINCT coalesce(e.user_id::text, e.client_id))::int FROM play_events e
      WHERE e.source_id = t.id::text
        AND e.listened_sec >= 30
        AND e.user_id IS DISTINCT FROM t.user_id
        AND e.started_at > now() - interval '30 days'),
    (SELECT count(DISTINCT sv.visitor_key)::int FROM playlist_share_visits sv
      WHERE sv.playlist_id = t.id
        AND sv.created_at > now() - interval '30 days')
  FROM targets t;
$$;

REVOKE ALL ON FUNCTION public.get_playlist_signal_stats(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_playlist_signal_stats(UUID[]) TO service_role;

-- 6. 보관 기간: 조회·공유 유입·관심 없음 기록도 2년 후 자동 파기 ----------------
SELECT cron.schedule(
  'sofar-purge-playlist-signals',
  '40 18 * * *', -- 매일 03:40 (한국 시간)
  $$
    DELETE FROM public.playlist_views WHERE created_at < now() - interval '2 years';
    DELETE FROM public.playlist_share_visits WHERE created_at < now() - interval '2 years';
    DELETE FROM public.recommendation_feedback WHERE created_at < now() - interval '2 years';
  $$
);
