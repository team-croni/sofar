import { Play, ListPlus, Music, MoreVertical } from 'lucide-react';
import TrackThumbnail from '../playlist/TrackThumbnail';
import Dropdown from '../ui/Dropdown';

export default function SharedPlaylistCard({
  playlist,
  isActive,
  onSelectPlaylist,
  onPlayPlaylist,
  onAddPlaylistToQueue
}) {
  const previewTracks = playlist.tracks || [];
  const slots = [0, 1, 2, 3];
  const customCover = playlist.cover || playlist.cover_url;

  const sharedFolderDropdownOptions = [
    {
      label: '대기열 추가',
      icon: <ListPlus size={16} />,
      onClick: (e) => {
        if (e) e.stopPropagation();
        onAddPlaylistToQueue(playlist);
      }
    },
    {
      label: '전체 재생',
      icon: <Play size={16} />,
      onClick: (e) => {
        if (e) e.stopPropagation();
        onPlayPlaylist(playlist);
      }
    }
  ];

  return (
    <div
      className={`folder-card stagger-fade-item ${isActive ? 'active' : ''}`}
      onClick={() => onSelectPlaylist(playlist)}
    >
      <div className="folder-card-cover-wrapper">
        {customCover ? (
          <div className="folder-tile-cover custom-cover">
            <img src={customCover} alt={playlist.title} className="folder-custom-cover-img" />
          </div>
        ) : (
          <div className="folder-tile-cover">
            {slots.map(index => {
              const track = previewTracks[index];
              if (track && (track.youtube_video_id || track.custom_title)) {
                return (
                  <div key={index} className="folder-tile-cell">
                    <TrackThumbnail 
                      title={track.custom_title} 
                      artist={track.custom_artist} 
                      youtubeId={track.youtube_video_id} 
                      artwork={track.artwork}
                    />
                  </div>
                );
              }
              return (
                <div key={index} className="folder-tile-cell empty">
                  <Music size={14} className="empty-cell-icon" />
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="folder-card-info">
        <div className="folder-card-header-row">
          <span className="folder-card-title" title={playlist.title}>{playlist.title}</span>
          <div onClick={(e) => e.stopPropagation()}>
            <Dropdown 
              options={sharedFolderDropdownOptions} 
              align="right"
              trigger={(isOpen) => (
                <button 
                  className={`folder-kebab-trigger-btn ${isOpen ? 'active' : ''}`}
                  title="더보기"
                >
                  <MoreVertical size={14} strokeWidth={1.5} fill="currentColor" />
                </button>
              )}
            />
          </div>
        </div>
        <span className="folder-card-count">
          {playlist.author ? `${playlist.author} · ` : ''}{playlist.trackCount || previewTracks.length || 0}곡
        </span>
      </div>
    </div>
  );
}
