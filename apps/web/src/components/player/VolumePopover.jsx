import { useState, useEffect, useRef } from "react";
import { Volume, Volume1, Volume2, VolumeOff, VolumeX } from "lucide-react";
import "./VolumePopover.css";

export default function VolumePopover({
  volume,
  isMuted,
  changeVolume,
  toggleMute,
  currentTrack,
}) {
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const volumeRef = useRef(null);
  const hoverTimerRef = useRef(null);
  const closeTimerRef = useRef(null);

  // 볼륨 팝오버 외부 영역 클릭 시 닫기 감시
  useEffect(() => {
    function handleClickOutside(event) {
      if (volumeRef.current && !volumeRef.current.contains(event.target)) {
        setShowVolumeSlider(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  // 마우스를 0.2초 동안 올려놓으면 볼륨 팝업을 연다
  const handleMouseEnter = () => {
    clearTimeout(closeTimerRef.current);
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setShowVolumeSlider(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    clearTimeout(hoverTimerRef.current);
    // 버튼과 패널 사이의 간격을 넘어가는 동안 즉시 닫히지 않도록 약간의 지연 후 닫는다
    closeTimerRef.current = setTimeout(() => {
      setShowVolumeSlider(false);
    }, 200);
  };

  const handlePanelEnter = () => {
    clearTimeout(hoverTimerRef.current);
    clearTimeout(closeTimerRef.current);
  };

  const handlePanelLeave = () => {
    clearTimeout(hoverTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setShowVolumeSlider(false);
    }, 200);
  };

  const handleButtonClick = () => {
    clearTimeout(hoverTimerRef.current);
    clearTimeout(closeTimerRef.current);
    setShowVolumeSlider((prev) => !prev);
  };

  const handleVolumeChange = (e) => {
    changeVolume(parseInt(e.target.value, 10));
  };

  // 볼륨량에 따라 적절한 기본 Lucide 아이콘을 반환하는 헬퍼 (CSS 정렬 보정 클래스 포함)
  const getVolumeIcon = (vol, muted, size = 20) => {
    if (muted || vol === 0) {
      return (
        <Volume
          size={size}
          className="volume-icon-svg level-1"
          strokeWidth={1.5}
        />
      );
    }
    if (vol < 66) {
      return (
        <Volume1
          size={size}
          className="volume-icon-svg level-2"
          strokeWidth={1.5}
        />
      );
    }
    return (
      <Volume2
        size={size}
        className="volume-icon-svg level-3"
        strokeWidth={1.5}
      />
    );
  };

  return (
    <div
      ref={volumeRef}
      className="volume-popover-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={handleButtonClick}
        disabled={!currentTrack}
        className={`playback-btn volume-btn ${showVolumeSlider ? "active" : ""}`}
        title="볼륨 조절"
      >
        {getVolumeIcon(volume, isMuted, 24)}
      </button>

      {/* 수직형 볼륨 컨트롤 바 */}
      <div
        className={`volume-vertical-panel volume-vertical-popover ${showVolumeSlider ? "show" : ""}`}
        onMouseEnter={handlePanelEnter}
        onMouseLeave={handlePanelLeave}
      >
        {/* 상단 볼륨 텍스트 */}
        <span className="volume-value-text">{volume}</span>

        {/* 중간 슬라이더 */}
        <div className="volume-vertical-wrapper">
          <input
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={handleVolumeChange}
            disabled={!currentTrack}
            className="input-slider volume-vertical-input"
            style={{
              background: `linear-gradient(to right, var(--primary-warm) 0%, var(--primary-warm) ${volume}%, rgba(255, 255, 255, 0.08) ${volume}%, rgba(255, 255, 255, 0.08) 100%)`,
            }}
          />
        </div>

        {/* 하단 음소거 토글 버튼 */}
        <button
          onClick={toggleMute}
          disabled={!currentTrack}
          className={`volume-panel-mute-btn ${isMuted ? "muted" : "active"}`}
          title={isMuted ? "음소거 해제" : "음소거"}
        >
          <VolumeOff
            size={18}
            className="volume-icon-svg muted"
            strokeWidth={1.5}
          />
        </button>
      </div>
    </div>
  );
}
