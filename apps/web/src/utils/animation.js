/**
 * Stagger 애니메이션 인덱스 스타일 객체를 반환하는 공통 유틸리티 함수
 * @param {number} index - 아이템 순서 (0-based)
 * @param {Object} [extraStyle={}] - 추가 인라인 스타일
 * @returns {Object} React style object containing --index
 */
export function getStaggerStyle(index, extraStyle = {}) {
  return {
    '--index': typeof index === 'number' ? index : 0,
    ...extraStyle,
  };
}

/**
 * Stagger 애니메이션 CSS 클래스와 스타일을 한꺼번에 반환하는 유틸리티
 * @param {number} index
 * @param {string} [baseClassName='']
 * @param {Object} [extraStyle={}]
 */
export function getStaggerProps(index, baseClassName = '', extraStyle = {}) {
  return {
    className: `${baseClassName} stagger-fade-item`.trim(),
    style: getStaggerStyle(index, extraStyle),
  };
}
