-- 관리자 확정 테마 플레이리스트 저장소
-- 수익화 이후에는 CURATION_DISCOVERY_ENABLED=false로 설정하고 이 테이블만 사용합니다.

CREATE TABLE IF NOT EXISTS public.curated_playlists (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('theme', 'situation', 'genre')),
  category_label TEXT NOT NULL DEFAULT 'sofar 큐레이션',
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT 'sofar 큐레이션',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  tracks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS curated_playlists_active_order_idx
  ON public.curated_playlists (is_active, display_order);

-- API 서버의 service role만 읽기 때문에 공개 클라이언트에는 권한을 주지 않습니다.
ALTER TABLE public.curated_playlists ENABLE ROW LEVEL SECURITY;

-- 유저 공개 플레이리스트(playlists) 테이블 상태 컬럼 정렬 (선택적 동기화)
ALTER TABLE public.playlists ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE;
ALTER TABLE public.playlists ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
