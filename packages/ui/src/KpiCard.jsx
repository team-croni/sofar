import React from 'react';
import './KpiCard.css';

/**
 * KPI Metric 요약 카드 공통 컴포넌트
 *
 * @param {string} label - 상단 지표명
 * @param {string|number} value - 메인 수치
 * @param {string} [valueUnit] - 수치 단위 (예: '개', '곡', '명', '%')
 * @param {React.ReactNode} [subText] - 푸터 좌측 상세 구성 텍스트
 * @param {React.ReactNode} [tagText] - 푸터 우측 뱃지 텍스트
 * @param {'success'|'warning'|'info'|'purple'|'default'} [tagVariant='success'] - 뱃지 컬러 테마
 * @param {React.ReactNode} [topRight] - 상단 우측 추가 액션/아이콘
 * @param {Function} [onClick] - 클릭 이벤트 핸들러
 * @param {string} [className] - 추가 클래스명
 */
export default function KpiCard({
  label,
  value,
  valueUnit,
  subText,
  tagText,
  tagVariant = 'success',
  topRight,
  onClick,
  className = '',
  style,
  ...props
}) {
  const isClickable = typeof onClick === 'function';

  return (
    <div
      className={`sofar-kpi-card ${isClickable ? 'clickable' : ''} ${className}`.trim()}
      onClick={onClick}
      style={style}
      {...props}
    >
      <div className="sofar-kpi-card-top">
        <span className="sofar-kpi-label">{label}</span>
        {topRight && <div className="sofar-kpi-top-right">{topRight}</div>}
      </div>

      <div className="sofar-kpi-value-group">
        <span className="sofar-kpi-value">
          {value}
          {valueUnit && <span className="sofar-kpi-unit">{valueUnit}</span>}
        </span>
      </div>

      {(subText || tagText) && (
        <div className="sofar-kpi-footer">
          {subText && <span className="sofar-kpi-subtext">{subText}</span>}
          {tagText && (
            <span className={`sofar-kpi-tag ${tagVariant}`}>
              {tagText}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
