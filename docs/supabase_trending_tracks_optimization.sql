-- ─────────────────────────────────────────────────────────────
-- Supabase PostgreSQL 최적화 SQL 스크립트 (방법 B)
-- 실시간 음악 가사 조회 & 감상 알고리즘 랭킹 초고속 집계 쿼리
-- ─────────────────────────────────────────────────────────────

-- 1. lyric_caches 집계 속도 향상을 위한 복합 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_lyric_caches_artist_title_created 
ON public.lyric_caches (artist, title, created_at DESC);

-- 2. DB 엔진 내부 실시간 초고속 집계 RPC 함수 생성 (밀리초 단위 반환)
CREATE OR REPLACE FUNCTION public.get_trending_tracks(limit_num INT DEFAULT 20)
RETURNS TABLE (
  title TEXT,
  artist TEXT,
  view_count BIGINT
) 
LANGUAGE sql
STABLE
AS $$
  SELECT 
    title,
    artist,
    COUNT(*) AS view_count
  FROM public.lyric_caches
  WHERE title IS NOT NULL AND artist IS NOT NULL
  GROUP BY title, artist
  ORDER BY view_count DESC
  LIMIT limit_num;
$$;

-- 3. 권한 부여 (공개 읽기 가능)
GRANT EXECUTE ON FUNCTION public.get_trending_tracks(INT) TO anon, authenticated, service_role;
