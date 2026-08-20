# Contributing to sofar

먼저 `sofar` 프로젝트에 관심을 갖고 기여해 주셔서 진심으로 감사드립니다! 
본 문서는 개발 환경 구성, 브랜치 전략, 커밋 메시지 규칙, PR 작성 및 코드 스타일 가이드라인을 제공합니다.

---

## 🛠️ 개발 환경 준비 (Development Setup)

1. **Node.js 및 패키지 매니저**:
   - Node.js `v18.0.0` 이상 (권장: `v20+` or `v22+`)
   - npm `v9+` 이상
2. **저장소 Fork 및 Clone**:
   ```bash
   git clone https://github.com/<your-username>/sofar.git
   cd sofar
   npm install
   ```
3. **환경 변수 구성**:
   - `apps/web/.env.example` -> `apps/web/.env.local`
   - `apps/admin/.env.example` -> `apps/admin/.env`
   - `apps/api/.env.example` -> `apps/api/.env`
4. **로컬 실행**:
   ```bash
   npm run dev
   ```

---

## 🌿 브랜치 전략 (Branching Strategy)

- **`main`**: 상시 배포 가능한 프로덕션 메인 브랜치.
- **`feat/<기능명>`**: 새로운 기능 개발용 브랜치 (예: `feat/sleep-timer-fadeout`)
- **`fix/<버그명>`**: 버그 수정용 브랜치 (예: `fix/lyrics-scroll-jitter`)
- **`docs/<문서명>`**: 문서 추가 및 수정 (예: `docs/update-architecture`)
- **`refactor/<대상>`**: 코드 구조 리팩토링 (예: `refactor/audio-context`)

---

## 💬 커밋 메시지 컨벤션 (Commit Convention)

우리는 **[Conventional Commits](https://www.conventionalcommits.org/)** 규칙을 준수합니다.

```text
<타입>(<영역/패키지>): <간결한 설명>

[본문 (선택 사항)]

[이슈 번호 (선택 사항)]
```

### Type 목록
- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 작성 및 수정
- `style`: 코드 포맷팅, 세미콜론 누락 등 (비즈니스 로직 변경 없음)
- `refactor`: 코드 리팩토링 (동작 변경 없음)
- `perf`: 성능 개선
- `test`: 테스트 코드 추가 및 수정
- `chore`: 빌드 업무 수정, 패키지 매니저 설정 등

### 예시
```text
feat(web): add manual lyric offset adjustment controls
fix(api): resolve duration delta mismatch in bugs crawler
docs(admin): update user management specification
```

---

## 🧪 PR 제출 전 체크리스트 (Pull Request Checklist)

Pull Request를 제출하기 전에 아래 사항을 반드시 확인해 주세요:

1. [ ] `npm run build`를 실행하여 모든 패키지의 빌드가 정상적으로 완료되는지 확인합니다.
2. [ ] `npm run lint`를 실행하여 린트 오류가 없는지 확인합니다.
3. [ ] API Key, 토큰, 비밀번호 등 민감한 개인 정보가 커밋에 포함되지 않았는지 점검합니다.
4. [ ] 새로운 기능을 추가하거나 핵심 설계를 변경한 경우, `docs/` 디렉토리 내 명세서 및 `docs/README.md` 인덱스를 함께 갱신했는지 확인합니다. (문서 동기화 규칙 준수)

---

## 📜 Code of Conduct

모든 기여자는 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)에 명시된 행동 강령을 준수해야 합니다.
