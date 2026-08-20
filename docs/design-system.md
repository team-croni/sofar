# sofar Design System Reference

이 문서는 `sofar` 프로젝트의 디자인 시스템 명세서입니다. 코딩 에이전트(AI)와 개발자들이 일관된 브랜드 아이덴티티와 UI 패턴을 유지하며 개발할 수 있도록 설계되었습니다.

---

## 1. Design Tokens (디자인 토큰)

디자인 토큰은 모든 컴포넌트의 스타일링 기준이 되며, `packages/ui/src/styles/variables.css` 파일에 정의되어 있습니다. 반드시 하드코딩된 색상 대신 아래의 CSS 변수를 사용하세요.

### 1.1 Brand & Semantic Colors (브랜드 및 의미적 색상)

| 변수명 | 값 / 설명 | 용도 |
| :--- | :--- | :--- |
| `--bg-cozy` | `#121212` | 메인 앱의 배경색 (안정감 있는 차분한 파란 끼 빠진 딥 차콜 그레이) |
| `--primary-warm` | `#d4a373` | 브랜드 시그니처 컬러 (진행 바, 하이라이트 등에 사용되는 포인트 웜 베이지) |
| `--primary-warm-hover`| `#e2b384` | 시그니처 컬러 호버 상태 |
| `--success` | `#81c784` | 성공, 승인, 완료 상태 |
| `--error` | `#e57373` | 에러, 실패, 탈퇴 상태 |

### 1.2 Layout & Translucent Backgrounds (레이아웃 및 반투명 배경)

| 변수명 | 값 / 설명 | 용도 |
| :--- | :--- | :--- |
| `--bg-card` | `rgba(26, 26, 26, 0.65)` | 글래스모피즘 카드 및 패널 배경 (파란 끼 빠진 딥 그레이) |
| `--bg-card-hover` | `rgba(36, 36, 36, 0.85)` | 글래스모피즘 카드 호버 배경 |
| `--bg-input` | `rgba(20, 20, 20, 0.6)` | 폼 입력 요소의 내장 배경 |
| `--overlay-bg` | `rgba(0, 0, 0, 0.7)` | 모달 백드롭/딤드 레이어 배경 |

### 1.3 Borders (경계선)

| 변수명 | 값 / 설명 | 용도 |
| :--- | :--- | :--- |
| `--border-cozy` | `rgba(255, 255, 255, 0.06)` | 기본 테두리선 (세련되고 은은한 뉴트럴 화이트 반투명) |
| `--border-cozy-hover` | `rgba(255, 255, 255, 0.12)` | 호버 시 테두리선 |
| `--border-active` | `rgba(255, 255, 255, 0.24)` | 포커스 및 활성화 상태 테두리선 |

### 1.4 Typography & Motion (타이포그래피 및 모션)

* **Font Family**: `--font-sans: 'Outfit', 'Noto Sans KR', sans-serif;` (매끈하고 모던한 산세리프 형태)
* **Transitions**:
  * `--transition-smooth: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);` (패널 및 주요 카드 이동/전환용)
  * `--transition-fast: all 0.1s ease;` (버튼, 링크, 입력창 등의 빠른 상태 전환용 - 반응 속도를 100ms로 높여 쾌적한 피드백 제공)

---

## 2. Common UI Components (공통 UI 컴포넌트)

모든 공통 UI 컴포넌트는 `apps/web/src/components/ui/` 경로에 존재하며, 외부에서는 Barrel Export 구조를 통해 일괄 임포트하여 사용합니다.

```javascript
import { Button, Input, Modal, Card, Avatar, Badge } from '../components/ui';
```

### 2.1 Card (카드 / 컨테이너)
* **설명**: 글래스모피즘(Glassmorphism)과 블러 필터가 완벽하게 적용된 기본 컴포넌트 프레임입니다.
* **사용**:
  ```jsx
  <Card hoverable className="my-card">컨텐츠</Card>
  ```

### 2.2 Button (버튼)
* **설명**: 크기(sm, md, lg), 스타일 변형(primary, secondary, danger, ghost), 로딩 상태 및 아이콘 배치를 지원합니다.
* **사용**:
  ```jsx
  <Button variant="primary" loading={isLoading} onClick={handleClick}>
    확인
  </Button>
  ```

### 2.3 Input (입력창)
* **설명**: 레이블, 안내 메시지, 에러 메시지 처리가 통합되어 있으며 비밀번호 가시성 토글 기능(Eye icon)이 내장되어 있습니다.
* **사용**:
  ```jsx
  <Input
    type="email"
    label="이메일 주소"
    error={errorMsg}
    placeholder="your@email.com"
    value={email}
    onChange={e => setEmail(e.target.value)}
  />
  ```

### 2.4 Modal (모달 / 다이얼로그)
* **설명**: 모달 백드롭 오버레이가 포함되어 있으며 애니메이션 페이드인/아웃을 처리하고 제목, 설명, 풋터 액션을 배치할 수 있는 유연한 컴포넌트입니다.
* **사용**:
  ```jsx
  <Modal isOpen={isOpen} title="회원 탈퇴" onClose={handleClose}>
    <p>정말 탈퇴하시겠습니까?</p>
    <div className="modal-btn-row">
      <Button variant="secondary" onClick={handleClose}>취소</Button>
      <Button variant="danger" onClick={handleConfirm}>탈퇴</Button>
    </div>
  </Modal>
  ```

### 2.5 Avatar (아바타)
* **설명**: 구글 계정 프로필 이미지와 같이 외부 이미지 URL을 바인딩하고, 이미지가 없을 시 사용자의 이름 첫 글자를 플레이스홀더로 정렬해 줍니다.
* **사용**:
  ```jsx
  <Avatar src={user.avatarUrl} name={user.displayName} size={28} />
  ```

### 2.6 Badge (뱃지 / 태그)
* **설명**: 상태 표시기 또는 라벨 등에 작게 노출할 수 있는 컴포넌트입니다.
* **사용**:
  ```jsx
  <Badge variant="success">Active</Badge>
  ```

---

## 3. UI/UX 구현 규칙 (UI/UX Best Practices)

1. **Focus Outline**: 모든 포커스 가능한 컴포넌트(`input`, `button`)는 포커스 시 브라우저 기본 outline을 해제하는 대신 `--border-active` 또는 그에 상당하는 포커스 링을 제공해야 합니다.
2. **Hover Feedback**: 마우스 호버 시에는 투명도(`opacity`) 또는 배경색(`background-color`)의 보간을 활용하여 부드러운 피드백을 전달하되, 버튼이 위로 뜨거나 움직이는 느낌을 주는 `transform: translateY`와 같은 물리적 변형 효과는 사용하지 않습니다. 모든 상호작용은 일평면(Flat) 상에서 깔끔한 비주얼 변화 위주로 처리합니다.
3. **Accessibility (a11y)**: 아이콘 단독 버튼의 경우 `aria-label` 또는 `title`을 부여하여 스크린 리더 환경을 고려합니다.
4. **No-Glow Policy (발광 효과 배제)**: 인위적인 AI 느낌이나 네온 테크 스타일을 배제하기 위해, 모든 컴포넌트 및 호버 상태에서 발광 효과(컬러풀한 `box-shadow` 네온 그림자 등)를 사용하지 마십시오. 대신 명확하고 차분한 테두리선(`border`), 투명 배경 채우기 및 플랫/솔리드 형태의 음영만 제한적으로 활용합니다.
5. **Warm Point Accent Only (웜 톤 포인트 활용 최소화)**: UI의 심미적 밸런스를 지키기 위해 카드 배경이나 기본 테두리 등에는 웜 브라운/베이지 컬러의 사용을 자제하고 차분한 다크 뉴트럴 톤을 적용합니다. 브랜드 시그니처 컬러인 `--primary-warm`은 오직 핵심 컨트롤 버튼, 진행률 트랙(Progress Bar), 현재 재생 중인 텍스트/가사 하이라이팅 등 시선 집중이 집중적으로 필요한 포인트 영역에만 최소한으로 한정하여 활용합니다.
