<div align="center">

![sofar Logo](./packages/assets/sofar-full-logo.svg)

[![Release](https://img.shields.io/github/v/release/team-croni/sofar?include_prereleases&sort=semver&display_name=tag&color=3D8BA3)](https://github.com/team-croni/sofar/releases/latest)
[![License](https://img.shields.io/badge/License-All%20Rights%20Reserved-red.svg)](./LICENSE)

[버그 제보](https://github.com/team-croni/sofar/issues) · [기능 요청](https://github.com/team-croni/sofar/issues)

<div align="center">

**sofar**는 광고 없이 누구나 무료로 음악을 감상할 수 있는 웹 스트리밍 서비스입니다.<br>
유튜브 영상 중 커버나 라이브가 아닌 실제 원곡을 정확하게 찾아내는 자체 매칭 로직을 구현했고,<br>
이를 바탕으로 실시간 싱크 가사까지 매끄럽게 연동하여 완성도 높은 음악 감상 환경을 제공합니다.

</div>

·

·

·

</div>

## 📖 목차

- [소개](#-about-the-project-소개)
- [주요 기능](#-key-features-주요-기능)
- [아키텍처 및 기술 스택](#-architecture--tech-stack-아키텍처-및-기술-스택)
- [디렉토리 구조](#-monorepo-structure-디렉토리-구조)
- [빠른 시작 가이드](#-quick-start-빠른-시작-가이드)
- [환경변수 구성](#-environment-variables-환경변수-세부-구성)
- [기여 가이드](#-contributing-기여-가이드)
- [저작권 및 법적 고지](#-copyright--disclaimer-저작권-및-법적-고지)

---

## 📖 About The Project (소개)

**sofar**는 광고 없이 누구나 무료로 음악을 감상할 수 있는 웹 스트리밍 서비스입니다. 유튜브 영상 중 커버나 라이브가 아닌 **실제 원곡을 정확하게 찾아내는 자체 음원 매칭 로직**을 구현하였으며, 이를 바탕으로 **실시간 싱크 가사 연동 및 완성도 높은 웹 오디오 플레이어 환경**을 제공합니다.

- **미니멀 & 코지 다크 테마**: 장시간 청취에도 눈이 편안한 웜 다크 톤과 글래스모피즘 인터페이스
- **하이브리드 음원 매칭 엔진**: iTunes API 메타데이터 + YouTube 검색 + 재생길이(Duration Delta ±3s) 검증 알고리즘
- **실시간 싱크 가사 (LRC)**: LRCLIB 연동, 가사 탐색 스크롤, 실시간 오프셋 조절 및 집단지성 싱크 보정
- **비파괴적 대기열(Queue) & 백그라운드 재생 컨텍스트**: 듣던 차트나 앨범의 흐름을 깨지 않는 독자적 재생 큐 시스템
- **관리자 큐레이션 & 품질 관리(QC)**: 실시간 트렌드 분석, 음원 불일치 피드백 리포트 및 수동 유튜브 매칭 도구

---

## ✨ Key Features (주요 기능)

### 1. 🎧 정교한 오디오 플레이어 & 썸네일 자동 매핑
- **비디오 ID 오토 매핑**: 재생 중인 트랙의 비디오 ID로부터 공식 고화질 썸네일을 자동 추출하여 앨범 아트워크 구성
- **Vinyl 커버 애니메이션**: 재생 상태에 따라 부드럽게 회전 및 정지하는 턴테이블 애니메이션
- **유튜브 정책 가드레일**: IFrame API 규격 준수 미니 플레이어 상시 렌더링 및 재생 제한 영상 자동 스킵/토스트 알림

### 2. 🎼 하이브리드 음원 매칭 & 불일치 피드백 루프
- **지능형 메타데이터 클리닝**: 채널명 및 제목 내 방송사 태그, MV/라이브 불필요 키워드 자동 정제
- **재생시간(Duration Delta) 매칭**: 타겟 음원 길이와 후보 영상 길이 간 오차(±3s)를 정밀 분석하여 원곡 음원 우선 연결
- **사용자 피드백 & 페널티**: 재생 중 '원곡과 다름' 클릭 시 백엔드 페널티 부여 및 즉각 대체 음원으로 끊김 없는 전환

### 3. 📝 실시간 동기화 가사 시스템 (Synced Lyrics)
- **오픈 API 연동**: LRCLIB 쿼리를 통한 동기화 가사(LRC) 자동 수급 및 일반 텍스트 가사 폴백 지원
- **가사 클릭 탐색 (Seek To)**: 가사 구절 클릭 시 해당 시간대로 정밀 재생 이동
- **오프셋 미세 조절**: 라이브/커버 음원의 인트로 오차를 극복하기 위한 `±0.5s`, `±5.0s` 실시간 오프셋 보정 및 클라우드 동기화

### 4. 🗂️ 다중 플레이리스트 & 게스트 데이터 마이그레이션
- **클라우드 동기화**: Supabase PostgreSQL 기반 RLS(Row Level Security) 다중 플레이리스트 CRUD
- **게스트 모드 & 자동 병합**: 로그인 없이 브라우저 로컬 스토리지에 생성된 목록을 구글 로그인 시 원클릭으로 클라우드 계정에 자동 병합(Merge)

### 5. 📊 관리자 대시보드 & 큐레이션 스튜디오 (`@sofar/admin`)
- **실시간 통계 KPI**: 총 등록 트랙, 큐레이션 수, 유저 플레이리스트 및 가입 리스너 지표 모니터링
- **음원 불일치 리포트 관리**: 사용자 피드백을 곡 단위로 통합 보존 및 상태(미해결/해결) 관리
- **드래그앤드롭 수동 매칭**: 오른쪽 사이드바 유튜브 검색 패널을 통해 큐레이션 수록곡에 최적의 음원을 드래그앤드롭으로 즉시 연동

---

## 🏗️ Architecture & Tech Stack (아키텍처 및 기술 스택)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        sofar Monorepo (Turborepo)                      │
│                                                                        │
│   ┌─────────────────────┐   ┌─────────────────────┐   ┌────────────┐   │
│   │     @sofar/web      │   │    @sofar/admin     │   │ @sofar/ui  │   │
│   │    (Vite + React)   │   │    (Vite + React)   │   │  (Shared)  │   │
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

| 계층 | 기술 스택 | 설명 |
| :--- | :--- | :--- |
| **Monorepo Manager** | Turborepo, npm Workspaces | 고속 캐싱 빌드 및 멀티 패키지 오케스트레이션 |
| **Web Frontend** | React 18, Vite 5, React Query, Lucide Icons | 사용자용 메인 오디오 플레이어 웹 애플리케이션 (`apps/web`) |
| **Admin Frontend** | React 18, Vite 5, React Router, Lucide Icons | 큐레이터 및 운영자용 관리자 대시보드 (`apps/admin`) |
| **Backend API** | NestJS 11, TypeScript, Axios, Cheerio | 실시간 차트 크롤링, 키리스 유튜브 검색, 불일치 리포트 서버 (`apps/api`) |
| **Database & Auth** | Supabase (PostgreSQL, Supabase Auth, RLS) | 유저 프로필, 플레이리스트, 트랙, 큐레이션 영구 스토리지 |
| **Shared Packages** | Vanilla CSS, Atomic Design System | UI 컴포넌트 라이브러리(`packages/ui`), 정적 에셋(`packages/assets`), 공통 타입(`packages/types`) |

---

## 📁 Monorepo Structure (디렉토리 구조)

```text
sofar/
├── apps/
│   ├── web/               # 메인 리스너 웹 애플리케이션 (@sofar/web)
│   │   ├── src/
│   │   │   ├── components/# 플레이어, 가사 뷰어, 홈 피드, 검색 컴포넌트
│   │   │   ├── contexts/  # AudioContext, AuthContext, FavoriteContext
│   │   │   ├── hooks/     # useNowPlaying, useLyrics, useHomeFeed 등
│   │   │   └── utils/     # youtube.js, itunes.js, lrcParser.js 등
│   │   └── .env.example
│   ├── admin/             # 관리자 종합 대시보드 및 큐레이션 에디터 (@sofar/admin)
│   │   ├── src/
│   │   │   ├── pages/     # DashboardPage, CurationsPage, UsersPage
│   │   │   ├── components/# AdminHeader, AdminRightSidebar, KPI Cards
│   │   │   └── context/   # AdminContext, ToastContext
│   │   └── .env.example
│   └── api/               # NestJS 백엔드 API 서버 (@sofar/api)
│       ├── src/
│       │   ├── chart/     # 차트 크롤링, 유튜브 검색, 지속성 캐시
│       │   ├── admin/     # 큐레이션 및 사용자 관리 백엔드 서비스
│       │   └── email/     # 인증 및 알림 서비스
│       └── .env.example
├── packages/
│   ├── ui/                # 공통 디자인 시스템 UI 컴포넌트 (@sofar/ui)
│   ├── assets/            # SVG 아이콘 및 브랜드 로고 에셋 (@sofar/assets)
│   └── types/             # 공통 TypeScript 타입 정의 (@sofar/types)
├── docs/                  # 프로젝트 상세 기획 및 기술 명세서 모음 (12종)
├── PRD.md                 # 마스터 제품 요구사항 정의서 (v2.1)
├── TDD.md                 # 마스터 기술 설계 및 개발 가이드 (v2.1)
├── LICENSE                # 저작권 및 사용권 정책 (All Rights Reserved)
├── CONTRIBUTING.md        # 코드 기여 및 브랜치 가이드
├── SECURITY.md            # 보안 취약점 보고 정책
├── turbo.json             # Turborepo 파이프라인 설정
└── package.json           # 루트 워크스페이스 정의
```

---

## 🚀 Quick Start (빠른 시작 가이드)

### Prerequisites (사전 준비사항)
- **Node.js**: `v18.0.0` 이상 (권장 `v20+` or `v22+`)
- **npm**: `v9.0.0` 이상

### 1. 저장소 클론 (Clone Repository)
```bash
git clone https://github.com/team-croni/sofar.git
cd sofar
```

### 2. 의존성 설치 (Install Dependencies)
```bash
npm install
```

### 3. 환경 변수 설정 (Setup Environment Variables)
각 하위 앱 디렉토리에 `.env.example` 파일을 복사하여 `.env` 파일을 생성합니다.

```bash
# 메인 웹 앱 환경변수 설정
cp apps/web/.env.example apps/web/.env.local

# 관리자 웹 앱 환경변수 설정
cp apps/admin/.env.example apps/admin/.env

# 백엔드 API 서버 환경변수 설정
cp apps/api/.env.example apps/api/.env
```

### 4. 로컬 개발 서버 실행 (Run Dev Servers)
```bash
# 모든 앱(Web, Admin, API)을 동시에 병렬 실행
npm run dev

# 또는 개별 앱만 실행할 경우:
npm run dev:web    # http://localhost:5173 (메인 웹 플레이어)
npm run dev:admin  # http://localhost:5174 (관리자 대시보드)
npm run dev:api    # http://localhost:3001 (NestJS 백엔드 API)
```

### 5. 빌드 및 린트 검증 (Build & Lint)
```bash
# 모노레포 전체 빌드
npm run build

# 정적 코드 분석
npm run lint
```

---

## ⚙️ Environment Variables (환경변수 세부 구성)

### `apps/web/.env.local`
```ini
# 백엔드 NestJS API 서버 주소
VITE_API_URL=http://localhost:3001

# Supabase Auth 및 데이터베이스 연결
VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# 법적 고지 및 저작권 침해(DMCA) 문의 이메일 (선택)
VITE_CONTACT_EMAIL=example@email.com
VITE_DMCA_EMAIL=example@email.com
```

### `apps/admin/.env`
```ini
# 백엔드 API 및 웹 클라이언트 URL
VITE_API_URL=http://localhost:3001
VITE_WEB_URL=http://localhost:5173
```

### `apps/api/.env`
```ini
# 서버 포트 및 CORS 허용 프론트엔드 URL
PORT=3001
WEB_URL=http://localhost:5173

# Supabase 서비스 역할 키 (관리자 작업 및 캐시용)
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# 관리자 API 인증 키 (임의의 안전한 비밀 문자열)
ADMIN_API_KEY=your_secure_admin_api_key_here
```

---

## 🤝 Contributing (기여 가이드)

프로젝트에 기여해 주시는 모든 분들을 환영합니다! 기여 절차 및 코드 스타일에 대한 자세한 내용은 [CONTRIBUTING.md](./CONTRIBUTING.md) 및 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)를 참고해 주세요.

1. 이 저장소를 포크(Fork)합니다.
2. 기능 브랜치를 생성합니다: `git checkout -b feat/my-awesome-feature`
3. 변경 사항을 커밋합니다: `git commit -m 'feat: add awesome feature'`
4. 브랜치에 푸시합니다: `git push origin feat/my-awesome-feature`
5. Pull Request를 생성합니다.

---

## ⚖️ Copyright & Disclaimer (저작권 및 법적 고지)

### Copyright & Proprietary License
본 프로젝트의 모든 소스코드, UI/UX 디자인 및 관련 문서에 대한 지식재산권과 소유권은 **[Croni](https://github.com/team-croni)**에 있습니다.
- **Copyright (c) 2026 Croni (https://github.com/team-croni). All rights reserved.**
- 포트폴리오 열람, 코드 리뷰, 채용 평가 및 개인적인 비상업적 학습 목적의 조회를 허용하며, 권리자의 사전 서면 동의 없는 무단 복제, 상업적 서비스 운영 및 재배포를 엄격히 금합니다. 자세한 사항은 [LICENSE](./LICENSE)를 참조하십시오.

### Third-Party APIs & Fair Use Disclaimer
1. **YouTube API Compliance**: `sofar`는 YouTube IFrame Player API 및 공개 메타데이터 규격을 준수합니다. 본 프로젝트는 미디어 스트림을 서버에 복제하거나 다운로드하여 제공하지 않으며, YouTube의 공식 임베드 방식을 통해서만 렌더링합니다.
2. **Terms of Service**: 본 애플리케이션을 이용할 경우 [YouTube 이용약관](https://www.youtube.com/t/terms) 및 [Google 개인정보 처리방침](https://www.google.com/policies/privacy)에 동의한 것으로 간주됩니다.
3. **Intellectual Property**: 서비스에서 스트리밍되는 모든 음악, 영상, 앨범 아트 및 가사에 대한 저작권은 각 원작자 및 YouTube 콘텐츠 크리에이터에게 귀속됩니다.
4. **Live Deployment Guide**: 실제 도메인에서 서비스를 호스팅하고자 하는 운영자는 [docs/legal-privacy-policy-guide.md](./docs/legal-privacy-policy-guide.md)의 개인정보 처리방침 및 이용약관 작성 가이드를 반드시 준수해야 합니다.

