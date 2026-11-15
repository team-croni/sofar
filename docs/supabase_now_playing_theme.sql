-- 플레이리스트별 Now Playing 테마 (배경 이미지 / 파티클 효과 / 어둡기 / 녹화 모드 워터마크)
-- 형식: { "background": text, "effect": "none|snow|rain|sakura|fireflies",
--        "intensity": "low|medium|high", "dim": 0~0.8, "watermark": boolean }
-- 컬럼이 없어도 웹 앱은 localStorage('sofar_playlist_themes')로 동작하지만,
-- 기기 간 동기화를 위해 아래 마이그레이션을 실행해 주세요.
ALTER TABLE public.playlists ADD COLUMN IF NOT EXISTS now_playing_theme JSONB;
