# 한국 테마 후보 큐레이션 명세서

- Date: 2026-08-11
- Version: v3.0.0

## 목적

비상업 운영 단계에서 Last.fm의 공개 태그 데이터를 이용해 한국 음악 테마의 **후보곡**을 만들고, 기존 YouTube 매칭 로직으로만 재생 영상을 연결한다. 다른 사용자가 만든 플레이리스트를 수집하거나 복제하지 않는다.

지원 테마는 드라이브, 비 오는 날, 노동요, 싸이월드 감성, 2000년대 발라드다. 태그 기반 결과는 완성된 편집물이 아니므로, 공개 전에는 관리자가 곡·아티스트·발매연도 및 YouTube 매칭을 검수한다. 한국 대중 인지도를 높이기 위해 대표곡 seed를 함께 사용하고, 2000년대 발라드는 2000~2009년 발매연도가 확인된 곡만 허용한다.

## API 및 호출량

- **클라이언트 엔드포인트**: `GET /api/chart/theme-candidates`
- **호환 경로**: `GET /api/chart/youtube-curated`
- **후보 원천**: Last.fm `tag.getTopTracks`
- **캐시**: 태그별 24시간 서버 메모리 캐시. 동일 태그는 하루에 한 번만 외부 호출한다.
- **키**: 서버 환경변수 `LASTFM_API_KEY`만 사용한다. 브라우저에는 절대 노출하지 않는다.
- **메타데이터 보정**: 한국 iTunes 카탈로그를 제한적으로 조회해 한글 표기·앨범명·발매연도·앨범아트를 보정한다. rate-limit이면 원천 후보를 유지한다.
- **앨범아트 fallback**: Last.fm에 앨범 이미지가 없는 대표곡은 매칭된 YouTube 썸네일을 사용한다.

Last.fm은 무료 비상업 API에 사용 가능하지만, 실제 제한은 서비스가 적용하며 상업적·연구 목적은 별도 문의를 요구한다. 호출량을 우회하지 않으며 캐시가 만료되기 전에는 추가 요청을 만들지 않는다.

## 운영 모드

| 모드 | 설정 | 동작 |
| --- | --- | --- |
| 후보 생성 | `CURATION_DISCOVERY_ENABLED=true` | Last.fm 태그 후보를 생성한다. |
| 확정본 전용 | `CURATION_DISCOVERY_ENABLED=false` | 외부 음악 API를 호출하지 않고 `curated_playlists`의 관리자 확정본만 제공한다. |

수익화 전에는 반드시 확정본 전용 모드로 바꾸고, [supabase_curated_playlists.sql](./supabase_curated_playlists.sql)을 Supabase SQL Editor에서 한 번 실행한다. 관리자는 `curated_playlists.tracks`에 확정 트랙 배열을 입력하고 `is_active=true`로 게시한다.

각 트랙은 기존 `ChartTrack` 형태를 사용한다. 최소 필드는 `custom_title`, `custom_artist`, `searchQuery`이며, 검수 후 `youtube_video_id`와 `durationSec`을 함께 저장하는 것을 권장한다.

## YouTube 재생 유의사항

YouTube는 최종 영상 매칭 및 IFrame 재생에만 사용한다. 공식 API/IFrame 정책상 오디오 분리, 백그라운드 재생, 광고 차단 또는 플레이어 UI 훼손을 해서는 안 된다.
