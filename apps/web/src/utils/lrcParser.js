/**
 * LRC 싱크 가사 파서
 * [mm:ss.xx] 또는 [mm:ss.xxx] 형태의 타임태그 가사 라인을 파싱합니다.
 * @param {string} lrcText 
 * @returns {Array<{time: number, text: string}>}
 */
export function parseLRC(lrcText) {
  if (!lrcText) return [];
  
  const lines = lrcText.split('\n');
  const result = [];
  // [분:초.밀리초] 정규식. 분은 1~3자리, 밀리초 부분은 선택적이며 1~3자리일 수 있음.
  const timeRegex = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/;

  lines.forEach(line => {
    const trimmed = line.trim();
    // 메타데이터 태그 (예: [ar: Artist], [ti: Title], [offset: 0]) 필터링
    if (trimmed.startsWith('[') && !timeRegex.test(trimmed)) {
      return;
    }

    const match = timeRegex.exec(trimmed);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      
      // 밀리초 보정 (없으면 0, 1자리면 00 채움, 2자리면 0 채움)
      let milliseconds = 0;
      if (match[3]) {
        let msStr = match[3];
        if (msStr.length === 1) {
          msStr = msStr + '00';
        } else if (msStr.length === 2) {
          msStr = msStr + '0';
        }
        milliseconds = parseInt(msStr, 10);
      }
      
      const totalSeconds = (minutes * 60) + seconds + (milliseconds / 1000);
      const text = trimmed.replace(timeRegex, '').trim();
      
      result.push({ time: totalSeconds, text });
    }
  });

  // 시간 순서대로 정렬
  return result.sort((a, b) => a.time - b.time);
}
