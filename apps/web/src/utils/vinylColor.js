/**
 * 앨범 이미지가 없을 때 쓰는 LP판 배경색.
 * 기준색 #5d5d8f(= oklch(0.5 0.079 283))와 같은 밝기·채도에서 색상(hue)만 바꾼다.
 * OKLCH는 색상이 달라도 눈에 보이는 밝기가 같아서 어떤 색이 나와도 톤이 맞는다.
 * 같은 seed(보통 "아티스트|곡명")는 항상 같은 색이 나오므로 카드와 드래그 미리보기의 색이 일치한다.
 */
export function vinylHueFromSeed(seed) {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 360;
}

export function vinylBackground(seed) {
  return seed ? `oklch(0.5 0.079 ${vinylHueFromSeed(seed)})` : null;
}
