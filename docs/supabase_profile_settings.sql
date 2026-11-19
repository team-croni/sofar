-- =============================================================
-- 내 정보 · 설정 페이지용 스키마 변경
-- Supabase SQL Editor에서 한 번 실행하세요. (여러 번 실행해도 안전)
-- =============================================================

-- 1. 계정 단위 설정값 + 가입일
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 기존 프로필의 가입일을 auth.users 기준으로 채움
UPDATE public.profiles p
SET created_at = u.created_at
FROM auth.users u
WHERE u.id = p.id AND p.created_at > u.created_at;

-- 2. 새 플레이리스트는 기본 비공개 (사용자가 설정에서 바꿀 수 있음)
ALTER TABLE public.playlists ALTER COLUMN is_public SET DEFAULT false;

-- 3. 프로필 이미지 저장 버킷 (공개 읽기, 본인 폴더에만 쓰기)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars owner insert" ON storage.objects;
CREATE POLICY "avatars owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
CREATE POLICY "avatars owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars owner delete" ON storage.objects;
CREATE POLICY "avatars owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
