/**
 * 두 트랙 개체가 동일한 곡인지 여부를 다양한 식별자(id, youtube_video_id, 앨범, 곡명/아티스트 조합) 기반으로 매칭하는 유틸리티 함수
 */
export const isMatchTrack = (t, active) => {
  if (!t || !active) return false;

  // 1. 곡 제목이나 아티스트가 존재하는데 명백히 다르면 다른 곡으로 판단 (ID 충돌 방지)
  const tTitle = (t.custom_title || t.title || '').trim().toLowerCase();
  const aTitle = (active.custom_title || active.title || '').trim().toLowerCase();
  if (tTitle && aTitle && tTitle !== aTitle) {
    return false;
  }

  const tArtist = (t.custom_artist || t.artist || '').trim().toLowerCase();
  const aArtist = (active.custom_artist || active.artist || '').trim().toLowerCase();
  if (tArtist && aArtist && tArtist !== aArtist) {
    return false;
  }

  // 2. ID가 둘 다 존재하고 일치하는 경우
  if (t.id && active.id && t.id === active.id) {
    return true;
  }

  // 3. youtube_video_id가 둘 다 존재하는 경우
  if (t.youtube_video_id && active.youtube_video_id) {
    return t.youtube_video_id === active.youtube_video_id;
  }

  // 4. 앨범명이 둘 다 존재하는데 명백히 다르면 다른 앨범 버전(정규 vs 싱글 등)으로 판단
  const tAlbum = (t.album || t.albumName || '').trim().toLowerCase();
  const aAlbum = (active.album || active.albumName || '').trim().toLowerCase();
  if (tAlbum && aAlbum && tAlbum !== aAlbum) {
    return false;
  }

  // 5. 둘 다 고유 식별자(id)가 존재하는데 서로 다른 경우 (예: itunes 트랙 ID가 서로 다른 경우)
  if (t.id && active.id && t.id !== active.id) {
    if (
      (t.id.startsWith('itunes-') && active.id.startsWith('itunes-')) ||
      (t.id.startsWith('bugs-') && active.id.startsWith('bugs-'))
    ) {
      return false;
    }
  }

  // 6. 제목과 아티스트가 모두 존재하고 일치하는 경우 (위의 배제 조건 통과 시)
  if (tTitle && aTitle && tArtist && aArtist && tTitle === aTitle && tArtist === aArtist) {
    return true;
  }

  return false;
};

const hasKorean = (text) => /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(text);

/**
 * 사용자 UI 표시용 아티스트 이름 포매터
 * 괄호 병기(예: BIGBANG (빅뱅), 아이오아이(I.O.I)) 형태에서 한글명을 우선 추출하여 반환
 */
export const formatArtistName = (rawArtist) => {
  if (!rawArtist || typeof rawArtist !== 'string') return rawArtist || '';

  const parseSingleArtist = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return '';

    // 끝부분에 (괄호)가 있는 패턴 검출: 예: "BIGBANG (빅뱅)", "ATEEZ(에이티즈)", "아이오아이(I.O.I)"
    const match = trimmed.match(/^(.*?)\s*\(([^()]+)\)$/);
    if (!match) return trimmed;

    const [, main, sub] = match;
    const cleanMain = main.trim();
    const cleanSub = sub.trim();

    if (!cleanMain) return trimmed; // "(여자)아이들" 등 보호

    const mainHasKo = hasKorean(cleanMain);
    const subHasKo = hasKorean(cleanSub);

    // 1. 괄호 안(sub)에 한글이 있고 앞(main)에는 한글이 없는 경우 -> sub(한글) 선택 (예: BIGBANG (빅뱅) -> 빅뱅)
    if (subHasKo && !mainHasKo) {
      return cleanSub;
    }
    // 2. 앞(main)에 한글이 있고 괄호 안(sub)에는 한글이 없는 경우 -> main(한글) 선택 (예: 아이오아이(I.O.I) -> 아이오아이)
    if (mainHasKo && !subHasKo) {
      return cleanMain;
    }
    // 3. 둘 다 한글이 있는 경우 -> 기본명(main) 선택 (예: 옥상달빛 (옥달) -> 옥상달빛)
    if (mainHasKo && subHasKo) {
      return cleanMain;
    }
    // 4. 둘 다 한글이 없는 경우 -> 기본명(main) 선택 (예: Maroon 5 (US) -> Maroon 5)
    return cleanMain;
  };

  // 콤마로 연결된 여러 아티스트 처리 (예: "BIGBANG (빅뱅), 2NE1 (투애니원)" -> "빅뱅, 투애니원")
  if (rawArtist.includes(',')) {
    return rawArtist
      .split(',')
      .map(parseSingleArtist)
      .filter(Boolean)
      .join(', ');
  }

  return parseSingleArtist(rawArtist);
};

