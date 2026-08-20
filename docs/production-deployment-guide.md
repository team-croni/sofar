# Production Deployment Guide (프로덕션 배포 가이드)

> **최종 수정일 (Date)**: 2026-08-20  
> **문서 버전 (Version)**: v1.3.0

본 문서는 `sofar` 프로젝트의 서비스 배포 및 환경 구성 시 필요한 환경변수, Supabase Auth Webhook / Email Templates / OAuth 설정 및 보안 필수 체크리스트를 정리한 가이드라인입니다.

---

## 1. 프론트엔드 (React / Vite) 설정

### 1.1 사용자 웹 앱 (`apps/web`) 환경변수
Vite 프론트엔드가 호스팅 서버(Vercel, Netlify, Cloudflare Pages 등)에 배포된 후 다음 환경변수를 설정합니다.

| 변수명 | 설정 설명 | 예시값 |
| :--- | :--- | :--- |
| `VITE_API_URL` | 백엔드 NestJS API 서버 주소 | `https://api.your-domain.com` |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL (운영용 프로젝트 권장) | `https://your-supabase-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase Client-side Anonymous Key | `eyJhbGci...` |
| `VITE_CONTACT_EMAIL` | 사용자 지원 및 약관 문의 이메일 (선택) | `support@croni.kr` |
| `VITE_DMCA_EMAIL` | 저작권 침해(DMCA) 문의 이메일 (선택) | `dmca@croni.kr` |

### 1.2 관리자 스튜디오 (`apps/admin`) 환경변수
관리자 앱이 배포될 때 설정하는 환경변수입니다.

| 변수명 | 설정 설명 | 예시값 |
| :--- | :--- | :--- |
| `VITE_API_URL` | 백엔드 NestJS API 서버 주소 | `https://api.your-domain.com` |
| `VITE_WEB_URL` | 사용자 웹 앱 메인 URL (바로가기 연결용) | `https://sofar.croni.kr` |

---

## 2. 백엔드 (NestJS) 설정

### 2.1 환경변수 설정 (`apps/api/.env`)
백엔드가 호스팅 서버(Cloudtype, Render, AWS, Fly.io 등)에 배포된 후 다음 환경변수를 주입합니다.

| 변수명 | 설정 설명 | 예시값 |
| :--- | :--- | :--- |
| `PORT` | 백엔드 웹 서버 포트 | `3001` (또는 클라우드 자동 바인딩) |
| `WEB_URL` | 프론트엔드 사용자 웹 앱 URL (CORS 허용 대상) | `https://sofar.croni.kr` |
| `ADMIN_URL` | 관리자 스튜디오 웹 앱 URL (CORS 허용 대상) | `https://admin.sofar.croni.kr` |
| `SUPABASE_URL` | Supabase 프로젝트 URL | `https://your-supabase-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | API 관리자 및 DB 접근용 Supabase Service Role Key | `eyJhbGci...` |
| `ADMIN_API_KEY` | 관리자 스튜디오 API 인증 비밀 키 (난수 32자 이상 권장) | `your-secure-admin-api-key` |
| `GMAIL_USER` | 자체 메일 발송용 계정 주소 (Nodemailer 사용 시) | `your-service@gmail.com` |
| `GMAIL_APP_PASSWORD` | Google 계정 16자리 앱 비밀번호 | `abcd efgh ijkl mnop` |

> [!TIP]
> 서비스 규모가 확장되어 하루 메일 발송량이 수백 건을 초과하게 되면 Gmail 정책에 의해 메일 발송이 일시 제한됩니다. 이 경우 `email.service.ts` 설정을 **Resend** 또는 **Brevo** 등 전문 SMTP로 마이그레이션할 것을 권장합니다.

---

## 3. Supabase Dashboard 설정

### 3.1 Auth Hooks 운용 지침 (개발 vs 운영)

Supabase는 인증 이벤트(이메일 발송 등) 발생 시 외부 웹훅을 호출하는 **Auth Hooks** 기능을 제공합니다.

| 환경 | 권장 설정 방식 | 상세 동작 |
| :--- | :--- | :--- |
| **로컬 개발 / 테스트** | **Send Email hook 비활성화 (Disabled)** 또는 **ngrok 터널링 연결** | • **비활성화 시**: Supabase 기본 내장 메일 서비스로 전송 (시간당 30통 제한, 별도 서버 불필요)<br>• **ngrok 사용 시**: 백엔드 `@sofar/api` 구동 후 ngrok 주소 등록 |
| **프로덕션 배포** | **Send Email hook 활성화 (운영 API URL 연결)** 또는 **Custom SMTP 연동** | • 배포된 백엔드 URL 등록: `https://<api.your-domain.com>/api/email/auth-hook`<br>• 또는 Supabase **Custom SMTP (Resend 등)** 연동 |

> [!WARNING]
> 로컬에서 사용하던 `ngrok` 세션이 만료되거나 닫힌 상태에서 `Send Email hook`이 활성화되어 있으면, Supabase가 메일 발송 시 **`500 Internal Server Error (Unexpected status code returned from hook: 404)`**를 반환하며 사용자에게 에러가 발생합니다.

---

### 3.2 sofar 브랜드 Email Templates 커스텀 가이드

Supabase 기본 이메일 서비스를 이용할 때, 기본 영문 템플릿 대신 sofar 브랜드(다크 테마 & 웜 골드 악센트)에 맞춘 한글 이메일 템플릿을 등록하여 사용합니다.

**설정 경로**: Supabase Dashboard ➡️ **Authentication** ➡️ **Email Templates**

#### 1) 비밀번호 재설정 (`Reset Password`)
* **Subject (제목)**: `[sofar] 비밀번호 재설정 안내`
* **Body (HTML)**:
```html
<div style="background-color: #0d0c0a; padding: 48px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; min-height: 100%;">
  <div style="max-width: 460px; margin: 0 auto; background: #181512; border: 1px solid rgba(212, 163, 115, 0.18); border-radius: 20px; padding: 40px 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
    <div style="margin-bottom: 28px;">
      <span style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #d4a373;">sofar</span>
    </div>
    <h1 style="font-size: 22px; font-weight: 700; color: #f5f2eb; margin: 0 0 12px; line-height: 1.3;">
      비밀번호 재설정
    </h1>
    <p style="font-size: 14px; line-height: 1.6; color: #9c9489; margin: 0 0 32px;">
      안녕하세요. sofar 계정의 비밀번호 재설정을 위한 요청이 접수되었습니다. 아래 버튼을 눌러 새 비밀번호를 설정해 주세요.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{{ .ConfirmationURL }}" 
         style="display: block; background: #d4a373; color: #181512; font-weight: 700; font-size: 15px; text-decoration: none; padding: 16px 24px; border-radius: 12px; text-align: center; box-shadow: 0 4px 16px rgba(212, 163, 115, 0.25);">
        비밀번호 재설정하기
      </a>
    </div>
    <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 24px; margin-top: 32px;">
      <p style="font-size: 12px; line-height: 1.6; color: #6b645b; margin: 0;">
        • 본인이 요청하지 않은 경우 이 메일을 무시하셔도 됩니다.<br>
        • 이 링크는 보안을 위해 일정 시간 후 자동으로 만료됩니다.
      </p>
    </div>
    <div style="margin-top: 28px; text-align: center;">
      <p style="font-size: 11px; color: #4a453e; margin: 0;">
        © 2026 sofar. All rights reserved.
      </p>
    </div>
  </div>
</div>
```

#### 2) 가입 인증 (`Confirm signup`)
* **Subject (제목)**: `[sofar] 회원가입 이메일 인증`
* **Body (HTML)**:
```html
<div style="background-color: #0d0c0a; padding: 48px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; min-height: 100%;">
  <div style="max-width: 460px; margin: 0 auto; background: #181512; border: 1px solid rgba(212, 163, 115, 0.18); border-radius: 20px; padding: 40px 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
    <div style="margin-bottom: 28px;">
      <span style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #d4a373;">sofar</span>
    </div>
    <h1 style="font-size: 22px; font-weight: 700; color: #f5f2eb; margin: 0 0 12px; line-height: 1.3;">
      회원가입 인증 코드
    </h1>
    <p style="font-size: 14px; line-height: 1.6; color: #9c9489; margin: 0 0 28px;">
      sofar 서비스 가입을 환영합니다! 아래 6자리 인증 코드를 입력하여 회원가입을 완료해 주세요.
    </p>
    <div style="background: #12100e; border: 1px solid rgba(212,163,115,0.25); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 38px; font-weight: 900; letter-spacing: 12px; color: #d4a373; font-family: monospace;">{{ .Token }}</span>
    </div>
    <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 24px; margin-top: 32px;">
      <p style="font-size: 12px; line-height: 1.6; color: #6b645b; margin: 0;">
        • 본 인증 코드는 10분간 유효합니다.<br>
        • 본인이 가입을 요청하지 않은 경우 이 메일을 무시해주세요.
      </p>
    </div>
    <div style="margin-top: 28px; text-align: center;">
      <p style="font-size: 11px; color: #4a453e; margin: 0;">
        © 2026 sofar. All rights reserved.
      </p>
    </div>
  </div>
</div>
```

---

### 3.3 URL Configuration 및 OAuth Redirects 등록
1. Supabase Dashboard -> **Authentication** -> **URL Configuration**으로 이동합니다.
2. **Site URL**을 프로덕션 프론트엔드 주소로 입력합니다. (예: `https://sofar.croni.kr`)
3. **Redirect URLs**에 소셜 로그인(Google/Kakao 등) 및 비밀번호 재설정 후 안전하게 리다이렉트되어 돌아올 허용 도메인을 등록합니다.
   * `https://sofar.croni.kr/**`
   * `https://admin.sofar.croni.kr/**`
   * `http://localhost:5173/**` (로컬 개발용)
   * `http://localhost:5174/**` (로컬 관리자용)

### 3.4 OAuth 소셜 로그인 Provider 설정 규격
Google, Kakao 등 OAuth Provider를 연동할 경우 해당 플랫폼 개발자 센터에 Supabase Callback URL을 등록해야 합니다:
* **OAuth Callback URL**: `https://<your-supabase-project-id>.supabase.co/auth/v1/callback`

### 3.5 Email OTP Length 검증
1. Supabase Dashboard -> **Authentication** -> **Providers** -> **Email** 설정을 확인합니다.
2. **Email OTP length**가 **`6`**으로 설정되어 있는지 최종 확인합니다.

---

## 4. Supabase DB 마이그레이션 & RLS 점검

운영 환경 Supabase 데이터베이스 생성 시 다음 SQL 스크립트들이 적용되어 있어야 합니다:
1. `docs/supabase_curated_playlists.sql`: 큐레이션 플레이리스트 및 장르 카테고리 관리 테이블
2. `docs/supabase_trending_tracks_optimization.sql`: 트렌딩 트랙 캐시 및 인덱스 최적화
3. `user_playlists`, `playlist_tracks`, `favorites`, `song_match_reports` 테이블에 RLS(Row Level Security)가 활성화되어 있는지 확인 (`auth.uid() = user_id` 조건 필수)

---

## 5. 프로덕션 보안 체크리스트 (Security Check)

현재 로컬 개발 환경에서는 개발 편의성 및 통신 트러블슈팅을 방지하기 위해 `email.controller.ts` 내의 **HTTP Header Bearer 토큰 및 HMAC SHA-256 서명 검증** 로직이 조건적으로 생략 가능하도록 작성되어 있습니다.

프로덕션 환경으로 최종 릴리즈할 때는 **반드시** 이 보안 검증을 통과하도록 강제해야 공격자가 발송 API 주소를 크롤링하여 무단으로 메일을 발송(스팸 공격 등)하는 보안 사고를 막을 수 있습니다.

### [보안 조치 방법]
1. 백엔드 배포 환경변수에 `SUPABASE_SERVICE_ROLE_KEY` 및 `SUPABASE_HOOK_SECRET`을 **반드시** 채워줍니다.
2. [`email.controller.ts`](file:///Users/jongyeon/Desktop/Projects/PRODUCT/sofar/apps/api/src/email/email.controller.ts) 내에서 해당 환경변수 값이 비어있어도 우회하여 넘어가게 한 임시 스킵 처리나 `if (serviceRoleKey)` 구문 등을 필수 인증으로 리팩토링합니다.
