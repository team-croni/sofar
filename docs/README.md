# sofar Documents Index

이 디렉토리는 `sofar` 프로젝트의 주요 설계 정의서, 기획서, 환경 설정 가이드 등의 문서를 모아둔 곳입니다.

| 문서 파일명 | 최종 수정일 | 수정 요약 | 버전 |
| :--- | :--- | :--- | :--- |
| [recommendation-spec.md](./recommendation-spec.md) | 2026-11-23 | 4단계 협업 필터링(함께 들은 곡, cf 팔)과 어뷰징 방지 추가 | v1.4.0 |
| [supabase_rec_cf.sql](./supabase_rec_cf.sql) | 2026-11-23 | 곡별 '함께 들은 곡' 이웃 테이블, 매일 다시 계산하는 함수, cf 팔 허용 | v1.0.0 |
| [supabase_rec_ltr.sql](./supabase_rec_ltr.sql) | 2026-11-23 | 서버 추천 기록(점수 재료), 학습 가중치 버전, 학습 데이터 함수, 2년 자동 파기 | v1.0.0 |
| [supabase_rec_bandit.sql](./supabase_rec_bandit.sql) | 2026-11-23 | 추천 이벤트 arm 컬럼, 팔별 노출·보상 집계 함수, 버전별 성과 비교 쿼리 | v1.0.0 |
| [supabase_playlist_signals.sql](./supabase_playlist_signals.sql) | 2026-11-20 | 플레이리스트 반응·조회·공유 유입·관심 없음 테이블, 사람 수 기준 집계 함수, 2년 자동 파기 | v1.0.0 |
| [supabase_listening_events.sql](./supabase_listening_events.sql) | 2026-11-20 | 감상 기록·추천 이벤트 테이블, 2년 자동 파기 예약 작업, 연령·성별 선택 컬럼 | v1.0.0 |
| [legal-privacy-policy-guide.md](./legal-privacy-policy-guide.md) | 2026-11-23 | 다른 이용자 감상 기록의 비식별 집계('함께 들은 곡')를 추천에 활용함을 명시 | v2.4.0 |
| [admin-dashboard-spec.md](./admin-dashboard-spec.md) | 2026-08-15 | 음원 불일치 리포트 상태 관리(미해결/해결완료), 영구 보존 및 서브 필터 정책 추가 | v1.4.0 |
| [manual-youtube-matching-sidebar.md](./manual-youtube-matching-sidebar.md) | 2026-08-13 | 관리자 수동 매칭 오른쪽 사이드바 (노래/유튜브 검색 패널, Drag&Drop 기능) 규격 작성 | v1.1.0 |
| [youtube-curated-spec.md](./youtube-curated-spec.md) | 2026-08-11 | Last.fm 기반 한국 테마 후보 생성 및 수익화 전환용 관리자 확정본 운영 | v3.0.0 |
| [supabase_curated_playlists.sql](./supabase_curated_playlists.sql) | 2026-08-12 | 관리자 큐레이션 플레이리스트 저장 테이블 (장르 카테고리 추가) | v1.1.0 |
| [category-playlists-spec.md](./category-playlists-spec.md) | 2026-11-20 | 섹션명 'sofar 플레이리스트', 공유 탭 제거(취향 저격 추천으로 이동) 반영 | v1.2.0 |
| [supabase_profile_settings.sql](./supabase_profile_settings.sql) | 2026-11-19 | 내 정보·설정 페이지용 프로필 설정값, 가입일, 프로필 이미지 버킷 | v1.0.0 |
| [supabase_now_playing_theme.sql](./supabase_now_playing_theme.sql) | 2026-11-16 | 플레이리스트별 Now Playing 테마(배경·파티클·어둡기·워터마크) 컬럼 | v1.0.0 |
| [supabase_trending_tracks_optimization.sql](./supabase_trending_tracks_optimization.sql) | 2026-08-21 | 가사 조회 인덱스 및 뜨고 있는 음악 랭킹 집계 함수 | v1.0.0 |
| [playback-system-spec.md](./playback-system-spec.md) | 2026-08-07 | 오디오 플레이어 재생 컨텍스트 & 대기열(Queue) 아키텍처 및 작동 규격 문서 신규 작성 | v1.0.0 |
| [production-deployment-guide.md](./production-deployment-guide.md) | 2026-08-20 | Supabase Auth Hook / OAuth / Email Templates 규격 및 관리자 CORS 인프라 점검 가이드 최신화 | v1.3.0 |
| [design-system.md](./design-system.md) | 2026-07-11 | UI 공통 컴포넌트 규격 및 디자인 시스템 가이드 문서 신규 추가 | v1.0.0 |
| [PRD.md](../PRD.md) | 2026-11-20 | 감상 기록 수집, 개인화 추천(F-RECO), 홈 피드 구성 개편 반영 | v2.3.0 |
| [TDD.md](../TDD.md) | 2026-11-20 | 감상 기록·추천 이벤트 스키마, 추천 엔진 및 listening API 모듈 추가 | v2.2.0 |
| [README.md](../README.md) | 2026-11-20 | 개인화 추천 기능 및 listening 모듈 구조 반영 | v2.2.0 |

