-- =============================================================
-- 감상 기록 · 추천 이벤트 수집 스키마
-- Supabase SQL Editor에서 한 번 실행하세요. (여러 번 실행해도 안전)
--
-- 원칙
-- - 재생 1회 = play_events 1행. 곡이 끝나거나, 다른 곡으로 넘어가거나, 탭을 닫을 때 기록한다.
-- - 원본 이벤트는 가공하지 않고 쌓는다. 통계(시간대별/연령별/완주율 등)는 나중에 쿼리로 뽑는다.
-- - 쓰기는 API 서버(service_role)만 한다. 클라이언트는 본인 기록 조회만 가능하다.
-- =============================================================

-- 1. 재생 이벤트 -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.play_events (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- 로그인 사용자 (검증된 토큰 기준)
  client_id     TEXT NOT NULL,                                     -- 브라우저 단위 익명 ID (비로그인 포함)
  session_id    TEXT,                                              -- 탭(앱 실행) 단위 ID: 연속 감상 흐름 분석용

  -- 곡 식별
  track_key     TEXT NOT NULL,           -- "곡명_아티스트" 소문자 (차트와 같은 규칙)
  title         TEXT,
  artist        TEXT,
  video_id      TEXT,

  -- 감상 정도
  started_at    TIMESTAMPTZ NOT NULL,
  ended_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  listened_sec  INTEGER NOT NULL DEFAULT 0,  -- 실제로 재생된 시간 (일시정지·탐색 제외)
  duration_sec  INTEGER,                     -- 곡 길이
  completion    REAL,                        -- listened_sec / duration_sec (0~1)
  end_reason    TEXT NOT NULL DEFAULT 'switched'
                CHECK (end_reason IN ('ended', 'switched', 'closed', 'error')),
  is_skip       BOOLEAN NOT NULL DEFAULT false, -- 30초 미만이면서 절반도 안 듣고 넘긴 경우
  seek_count    SMALLINT NOT NULL DEFAULT 0,

  -- 어디서 재생했는지 (추천 성과 측정의 핵심)
  source_type   TEXT,   -- my | shared | curated | chart | queue | recommend | search | unknown
  source_id     TEXT,   -- 플레이리스트 ID 등
  rec_algo      TEXT,   -- 추천에서 재생했다면 알고리즘 버전 (예: hybrid-v1)
  rec_request_id TEXT,  -- 추천 응답 ID (노출 → 클릭 → 감상 연결)

  -- 재생 당시 맥락
  tz            TEXT,     -- 예: Asia/Seoul
  local_hour    SMALLINT, -- 사용자 현지 시각 (0~23)
  local_dow     SMALLINT, -- 사용자 현지 요일 (0=일 ~ 6=토)
  device        TEXT,     -- desktop | mobile | tablet
  locale        TEXT
);

-- 재생이 어떻게 시작됐는지 (추가 컬럼: 이미 테이블을 만들었어도 이 문장으로 추가된다)
--   search      검색 결과에서 골라 재생
--   click       목록·카드에서 직접 눌러 재생
--   skip_button 다음/이전 버튼
--   auto        앞 곡이 끝나서(또는 재생 실패로) 자동으로 넘어옴
--   resume      멈춰 둔 곡을 다시 재생 (새로고침 후 이어 듣기 등)
ALTER TABLE public.play_events ADD COLUMN IF NOT EXISTS trigger TEXT
  CHECK (trigger IS NULL OR trigger IN ('search', 'click', 'skip_button', 'auto', 'resume'));

CREATE INDEX IF NOT EXISTS play_events_user_time_idx   ON public.play_events (user_id, started_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS play_events_client_time_idx ON public.play_events (client_id, started_at DESC);
CREATE INDEX IF NOT EXISTS play_events_track_time_idx  ON public.play_events (track_key, started_at DESC);
CREATE INDEX IF NOT EXISTS play_events_time_idx        ON public.play_events (started_at DESC);

ALTER TABLE public.play_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "play_events owner read" ON public.play_events;
CREATE POLICY "play_events owner read" ON public.play_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. 추천 노출·클릭 이벤트 -----------------------------------------
-- 무엇을 보여줬고 무엇을 눌렀는지 남겨야 나중에 알고리즘을 비교(A/B)하고 학습시킬 수 있다.
CREATE TABLE IF NOT EXISTS public.recommendation_events (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id     TEXT NOT NULL,
  request_id    TEXT NOT NULL,
  algo          TEXT NOT NULL,
  event         TEXT NOT NULL CHECK (event IN ('impression', 'click', 'play')),
  item_type     TEXT NOT NULL,   -- track | curated | shared
  item_id       TEXT NOT NULL,   -- track_key 또는 플레이리스트 ID
  position      SMALLINT,
  reason        TEXT
);

CREATE INDEX IF NOT EXISTS recommendation_events_request_idx ON public.recommendation_events (request_id);
CREATE INDEX IF NOT EXISTS recommendation_events_time_idx    ON public.recommendation_events (created_at DESC);

ALTER TABLE public.recommendation_events ENABLE ROW LEVEL SECURITY;
-- 정책 없음: service_role(API 서버)만 읽고 쓴다.

-- 3. 보관 기간: 2년이 지난 기록은 매일 자동 삭제 (개인정보 처리방침 3항과 맞춰야 함) ----
-- Supabase 대시보드 > Database > Extensions 에서 pg_cron이 켜져 있어야 한다.
-- 같은 이름으로 다시 실행하면 기존 예약을 덮어쓴다.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'sofar-purge-listening-events',
  '30 18 * * *', -- 매일 03:30 (한국 시간, UTC 18:30)
  $$
    DELETE FROM public.play_events WHERE started_at < now() - interval '2 years';
    DELETE FROM public.recommendation_events WHERE created_at < now() - interval '2 years';
  $$
);

-- 회원 탈퇴 시에는 API(account.service)가 이 두 테이블의 해당 사용자 기록을 바로 삭제한다.

-- 4. 연령·성별 통계용 프로필 컬럼 (선택 입력) ------------------------
-- 수집 전 개인정보 처리방침에 항목과 목적을 추가하고, 설정 화면에서 선택 입력으로 받는다.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birth_year SMALLINT
  CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT
  CHECK (gender IS NULL OR gender IN ('female', 'male', 'other', 'undisclosed'));

-- =============================================================
-- 통계 쿼리 예시 (실행할 필요 없음, 참고용)
-- =============================================================
-- 시간대별 재생 수 (한국 시간)
--   SELECT local_hour, count(*) FROM play_events
--   WHERE started_at > now() - interval '30 days' AND NOT is_skip
--   GROUP BY 1 ORDER BY 1;
--
-- 연령대 · 성별별 많이 들은 곡
--   SELECT (extract(year FROM e.started_at)::int - p.birth_year) / 10 * 10 AS age_group,
--          p.gender, e.title, e.artist, count(*) AS plays
--   FROM play_events e JOIN profiles p ON p.id = e.user_id
--   WHERE p.birth_year IS NOT NULL AND NOT e.is_skip
--   GROUP BY 1, 2, 3, 4 ORDER BY plays DESC LIMIT 100;
--
-- 곡별 완주율 · 스킵률
--   SELECT title, artist, count(*) AS plays,
--          avg(completion) AS avg_completion,
--          avg(is_skip::int) AS skip_rate
--   FROM play_events GROUP BY 1, 2 HAVING count(*) >= 20 ORDER BY plays DESC;
--
-- 추천 성과 (노출 대비 클릭률, 알고리즘 버전별)
--   SELECT algo,
--          count(*) FILTER (WHERE event = 'impression') AS impressions,
--          count(*) FILTER (WHERE event = 'click') AS clicks
--   FROM recommendation_events GROUP BY algo;
