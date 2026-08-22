import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, ListPlus, FolderPlus, ChevronRight, ListMusic } from 'lucide-react';
import Dropdown from './Dropdown';
import { usePlaylistsQuery } from '../../hooks/usePlaylists';
import { useAddTrackToPlaylist } from '../../hooks/useTracks';

function TrackActionDropdownContent({
  track,
  onPlay,
  onAddQueue,
  extraOptions,
  playlists,
  close,
}) {
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const [submenuPlacement, setSubmenuPlacement] = useState({
    direction: 'to-right',
    vertical: 'align-top',
  });
  const submenuRef = useRef(null);
  const timerRef = useRef(null);
  const { addTrackToPlaylist } = useAddTrackToPlaylist();

  const updateSubmenuPosition = useCallback(() => {
    if (!submenuRef.current) return;
    const rect = submenuRef.current.getBoundingClientRect();
    const submenuWidth = 195;
    const submenuHeight = 160;

    // Check horizontal room on right side
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;
    let direction = 'to-right';
    if (spaceRight < submenuWidth + 12 && spaceLeft >= submenuWidth + 12) {
      direction = 'to-left';
    }

    // Check vertical room below
    const bottomLimit = window.innerHeight - 12;
    let vertical = 'align-top';
    if (rect.top + submenuHeight > bottomLimit && rect.bottom - submenuHeight >= 12) {
      vertical = 'align-bottom';
    }

    setSubmenuPlacement({ direction, vertical });
  }, []);

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    updateSubmenuPosition();
    setIsSubmenuOpen(true);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsSubmenuOpen(false);
    }, 180);
  };

  const handleSubmenuMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const handleSubmenuMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsSubmenuOpen(false);
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleAddToPlaylist = async (targetPlaylist) => {
    const res = await addTrackToPlaylist(track, targetPlaylist);
    if (res.success || res.reason === 'ALREADY_EXISTS') {
      close();
    }
  };

  return (
    <div className="track-dropdown-mainpanel" onClick={(e) => e.stopPropagation()}>
      {onPlay && (
        <button
          type="button"
          className="sofar-dropdown-item"
          onClick={(e) => {
            e.stopPropagation();
            onPlay(track);
            close();
          }}
        >
          <span className="dropdown-item-icon"><Play size={14} /></span>
          <span className="dropdown-item-label">지금 바로 재생</span>
        </button>
      )}

      {onAddQueue && (
        <button
          type="button"
          className="sofar-dropdown-item"
          onClick={(e) => {
            e.stopPropagation();
            onAddQueue(track, 'end');
            close();
          }}
        >
          <span className="dropdown-item-icon"><ListPlus size={14} /></span>
          <span className="dropdown-item-label">대기열에 추가</span>
        </button>
      )}

      <div 
        ref={submenuRef}
        className="sofar-dropdown-submenu-container"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <button
          type="button"
          className={`sofar-dropdown-item has-submenu ${isSubmenuOpen ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            updateSubmenuPosition();
            setIsSubmenuOpen(prev => !prev);
          }}
        >
          <span className="dropdown-item-icon"><FolderPlus size={14} /></span>
          <span className="dropdown-item-label">플레이리스트에 추가</span>
          <ChevronRight size={14} className="dropdown-item-arrow" />
        </button>

        {isSubmenuOpen && (
          <div 
            className={`sofar-dropdown-submenu ${submenuPlacement.direction} ${submenuPlacement.vertical} is-ready`}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={handleSubmenuMouseEnter}
            onMouseLeave={handleSubmenuMouseLeave}
          >
            <div className="track-dropdown-playlists-list scrollbar-none">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  className="sofar-dropdown-item track-dropdown-playlist-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToPlaylist(pl);
                  }}
                >
                  <span className="dropdown-item-icon"><ListMusic size={14} /></span>
                  <span className="dropdown-playlist-title">{pl.title}</span>
                </button>
              ))}
              {playlists.length === 0 && (
                <div className="track-dropdown-empty">플레이리스트가 없습니다</div>
              )}
            </div>
          </div>
        )}
      </div>

      {extraOptions.map((opt, idx) => {
        if (!opt) return null;
        return (
          <button
            key={idx}
            type="button"
            className={`sofar-dropdown-item ${opt.className || ''}`}
            onClick={(e) => {
              e.stopPropagation();
              if (opt.onClick) opt.onClick(e);
              close();
            }}
          >
            {opt.icon && <span className="dropdown-item-icon">{opt.icon}</span>}
            <span className="dropdown-item-label">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function TrackActionDropdown({
  track,
  onPlay,
  onAddQueue,
  align = 'right',
  trigger,
  extraOptions = []
}) {
  const { data: playlists = [] } = usePlaylistsQuery();

  return (
    <Dropdown align={align} trigger={trigger}>
      {(close) => (
        <TrackActionDropdownContent
          track={track}
          onPlay={onPlay}
          onAddQueue={onAddQueue}
          extraOptions={extraOptions}
          playlists={playlists}
          close={close}
        />
      )}
    </Dropdown>
  );
}


