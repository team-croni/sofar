/**
 * JSONP를 사용한 유튜브 검색어 자동완성(제안) API 호출
 * @param {string} query 검색어
 * @returns {Promise<string[]>} 검색 제안 목록
 */
export function getYoutubeSuggestions(query) {
  if (!query || !query.trim()) return Promise.resolve([]);

  return new Promise((resolve) => {
    // 임의의 콜백 함수명 생성
    const callbackName = 'yt_suggest_' + Math.round(1000000 * Math.random());
    
    // 타임아웃 방지책 (3초 후 타임아웃)
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve([]);
    }, 3000);

    const cleanup = () => {
      clearTimeout(timeoutId);
      delete window[callbackName];
      const script = document.getElementById(callbackName);
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    // 글로벌 윈도우 객체에 콜백 할당
    window[callbackName] = (data) => {
      cleanup();
      // data 형식: ["query", [["suggestion1", 0], ["suggestion2", 0], ...], ...] 또는 ["query", ["suggestion1", ...]]
      if (data && Array.isArray(data[1])) {
        const cleaned = data[1].map(item => {
          if (typeof item === 'string') return item;
          if (Array.isArray(item) && typeof item[0] === 'string') return item[0];
          return null;
        }).filter(Boolean);
        resolve(cleaned);
      } else {
        resolve([]);
      }
    };

    // 스크립트 엘리먼트 생성 및 추가
    const script = document.createElement('script');
    script.id = callbackName;
    script.src = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query.trim())}&jsonp=${callbackName}`;
    script.async = true;

    document.body.appendChild(script);
  });
}
