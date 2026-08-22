# [개발 문서] 'sofar' 시스템 설계 및 개발 기술 가이드 (v2.1)

**마지막 수정일:** 2026-08-20  
**버전:** v2.1 (Turborepo 모노레포 아키텍처, NestJS 백엔드 파이프라인, Supabase RLS 스키마 및 공통 패키지 체계 최신화)

본 문서는 `sofar` 프로젝트의 아키텍처, 데이터베이스 스키마, 모노레포 구조, 핵심 음악 연동 로직 및 상태 관리 엔진을 구체적으로 기술합니다.

---

## 1. 시스템 아키텍처 개요 (System Architecture)

`sofar`는 Turborepo 기반 모노레포로 구축되어 있으며, 메인 사용자 웹 클라이언트(`@sofar/web`), 관리자 스튜디오(`@sofar/admin`), 전용 백엔드 API(`@sofar/api`), 그리고 공유 패키지(`@sofar/ui`, `@sofar/assets`, `@sofar/types`)로 구성됩니다.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        sofar Monorepo (Turborepo)                      │
│                                                                        │
│   ┌─────────────────────┐   ┌─────────────────────┐   ┌────────────┐   │
│   │     @sofar/web      │   │    @sofar/admin     │   │ @sofar/ui  │   │
│   │   (User Web App)    │   │   (Admin Studio)    │   │  (Shared)  │   │
│   └──────────┬──────────┘   └──────────┬──────────┘   └────────────┘   │
│              │                         │                               │
│              └────────────┬────────────┘                               │
│                           ▼                                            │
│              ┌─────────────────────────┐                               │
│              │       @sofar/api        │                               │
│              │    (NestJS Backend)     │                               │
│              └────────────┬────────────┘                               │
└───────────────────────────┼────────────────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│     Supabase Platform     │   │      External APIs        │
│  - Google OAuth 2.0 Auth  │   │  - YouTube IFrame API     │
│  - PostgreSQL with RLS    │   │  - LRCLIB (Synced Lyrics) │
│  - Curated Playlists Data │   │  - iTunes Search API      │
└───────────────────────────┘   └───────────────────────────┘
```

---

## 2. 데이터베이스 스키마 설계 (Database Schema & RLS)

Supabase PostgreSQL 데이터베이스 내 핵심 테이블 및 행 단위 보안(Row Level Security, RLS) 규칙입니다.

### 2.1. 사용자 프로필 테이블 (`profiles`)
```sql
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    username TEXT,
    avatar_url TEXT,
    email TEXT UNIQUE NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "사용자는 본인의 프로필만 읽고 수정할 수 있음" 
ON public.profiles FOR ALL 
USING (auth.uid() = id);
```

### 2.2. 플레이리스트 테이블 (`playlists`)
```sql
CREATE TABLE public.playlists (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    cover TEXT,
    is_public BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "누구나 공개 플레이리스트 읽기 가능"
ON public.playlists FOR SELECT
USING (is_public = true OR auth.uid() = user_id);

CREATE POLICY "본인 플레이리스트만 CRUD 가능" 
ON public.playlists FOR ALL 
USING (auth.uid() = user_id);
```

### 2.3. 트랙 테이블 (`tracks`)
```sql
CREATE TABLE public.tracks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE NOT NULL,
    youtube_video_id TEXT NOT NULL,
    custom_title TEXT NOT NULL,
    custom_artist TEXT NOT NULL,
    artwork TEXT,
    durationSec INTEGER DEFAULT 0 NOT NULL,
    lyric_offset NUMERIC DEFAULT 0.0 NOT NULL,
    custom_lyrics TEXT,
    sequence INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_playlist_track UNIQUE (playlist_id, youtube_video_id)
);

ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "플레이리스트 접근 권한에 따른 트랙 조회"
ON public.tracks FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.playlists 
        WHERE playlists.id = tracks.playlist_id 
          AND (playlists.is_public = true OR playlists.user_id = auth.uid())
    )
);

CREATE POLICY "소유자만 트랙 조작 가능" 
ON public.tracks FOR ALL 
USING (
    EXISTS (
        SELECT 1 FROM public.playlists 
        WHERE playlists.id = tracks.playlist_id AND playlists.user_id = auth.uid()
    )
);
```

### 2.4. 공식 큐레이션 플레이리스트 테이블 (`curated_playlists`)
```sql
CREATE TABLE public.curated_playlists (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL CHECK (category IN ('genre', 'theme', 'situation')),
    category_label TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    cover TEXT,
    tag TEXT,
    author TEXT DEFAULT 'sofar' NOT NULL,
    tracks JSONB DEFAULT '[]'::jsonb NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.curated_playlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "누구나 큐레이션 읽기 가능"
ON public.curated_playlists FOR SELECT
USING (is_active = true);
```

---

## 3. 모노레포 구조 및 패키지 정의 (Monorepo Layout)

```text
sofar/
├── apps/
│   ├── web/               # 사용자용 메인 웹 앱 (Vite + React 18)
│   ├── admin/             # 관리자 스튜디오 (Vite + React 18)
│   └── api/               # 백엔드 API 서버 (NestJS 11 + TypeScript)
├── packages/
│   ├── ui/                # 아토믹 디자인 시스템 컴포넌트 라이브러리
│   ├── assets/            # 브랜드 로고 및 SVG 에셋
│   └── types/             # 공통 TypeScript 타입 정의
├── docs/                  # 기술 명세서 및 가이드라인
├── PRD.md                 # 제품 요구사항 정의서
├── TDD.md                 # 시스템 설계 문서
└── turbo.json             # Turborepo 빌드 캐시 파이프라인
```

---

## 4. 핵심 음악 연동 및 재생 엔진 (Core Music Engine)

### 4.1. 하이브리드 음원 매칭 및 스코어링 (`apps/web/src/utils/youtube.js`)
음원 검색 시 다음 가중치 알고리즘을 적용하여 공식 원곡 음원을 자동 선별합니다:

1. **오피셜 채널/음원 가산점**:
   - `*- Topic` 채널: `+2500점` (YouTube Music Official 오디오 보장)
   - `Official Audio` / `음원`: `+1200점`
   - `Official MV` / `M/V`: `+500점`
2. **재생길이(Duration Delta) 오차 검증**:
   - `|targetSec - candidateSec| <= 3s`: `+1500점` (정밀 원곡)
   - `|targetSec - candidateSec| <= 7s`: `+800점` (MV 전/후주 포함)
   - `|targetSec - candidateSec| > 45s`: `-1500점` (라이브/풀앨범/교차편집 배제)
3. **비선호 키워드 감점 (`-2500점`)**:
   - `비긴어게인`, `킬링보이스`, `복면가왕`, `직캠`, `fancam`, `cover`, `노래방`, `1hour`, `mr`, `inst` 등

### 4.2. 비파괴적 재생 컨텍스트 & 대기열 분리 (`AudioContext.jsx`)
- **Queue (우선 대기열)**: 사용자가 `+` 또는 `대기열 추가`로 명시적 등록한 곡 목록.
- **Playback Context (재생 맥락)**: 차트, 큐레이션, 앨범 등 현재 재생 중인 배경 목록.
- **연속 재생 우선순위**: `Queue` 소비 ➔ 비어있을 시 `Playback Context` 다음 곡 ➔ `User Playlist` 순환.

### 4.3. LRC 싱크 가사 파서 & 오프셋 보정 루프 (`lrcParser.js`, `LyricsViewer.jsx`)
- `[mm:ss.xx]` 형태의 LRC 타임스탬프를 초 단위(`totalSeconds`) 배열로 파싱.
- 오프셋 값(`offset`)을 실시간 더하여 현재 재생 시간과 대조, 활성 행(`activeIndex`)을 도출하고 부드러운 스크롤(`scrollIntoView({ block: 'center' })`)을 수행.

---

## 5. 빌드 및 배포 파이프라인 (Build & Deployment)

```bash
# 루트에서 전체 빌드
npm run build

# 정적 분석 린트 검증
npm run lint

# 독립 앱 개발 모드 실행
npm run dev:web    # 포트 5173
npm run dev:admin  # 포트 5174
npm run dev:api    # 포트 3001
```