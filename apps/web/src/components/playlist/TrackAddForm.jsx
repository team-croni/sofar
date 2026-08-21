import React, { useState, useEffect, useRef } from 'react';
import { Plus, Play, Link, ListPlus, Search, List, LayoutGrid } from 'lucide-react';
import { supabase } from '../../contexts/AuthContext';
import { 
  extractVideoId, 
  searchYoutube, 
  getYoutubeVideoMetadata, 
  cleanYoutubeMetadata 
} from '../../utils/youtube';
import { getYoutubeSuggestions } from '../../utils/youtubeSuggest';
import { Modal } from '../ui';
import './TrackAddForm.css';

export default function TrackAddForm({ 
  selectedPlaylistId, 
  playlistLength, 
  user, 
  onTrackInserted, 
  showToast, 
  playTrack,
  addToQueue
}) {
  const [isAddingTrack, setIsAddingTrack] = useState(false);
  const [addMethod, setAddMethod] = useState('search'); // 'search' | 'url'
  
  // URL 추가 폼 상태
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customArtist, setCustomArtist] = useState('');

  // 검색 폼 상태
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [ytApiKey, setYtApiKey] = useState(localStorage.getItem('sofar_yt_api_key') || '');

  // 자동완성(Autocomplete) 관련 상태
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteRef = useRef(null);

  // 뷰 모드 토글 ('list' | 'grid')
  const [viewMode, setViewMode] = useState('list');

  // 실시간 자동완성 디바운싱 효과
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const list = await getYoutubeSuggestions(searchQuery);
        setSuggestions(list);
      } catch (err) {
        console.warn('Failed to fetch autocomplete suggestions:', err);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAddTrack = async (e) => {
    e.preventDefault();
    if (!selectedPlaylistId) {
      alert('먼저 플레이리스트를 선택하거나 생성해 주세요.');
      return;
    }

    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      alert('올바른 유튜브 주소를 입력해 주세요.');
      return;
    }

    let title = customTitle.trim();
    let artist = customArtist.trim();
    let needLlmRefine = false;
    let rawTitleForLlm = '';
    let rawChannelForLlm = '';

    // 사용자가 수동 입력을 건너뛰었을 때 유튜브 API를 조회하여 1차 정제 및 LLM 비동기 대기
    if (!title || !artist) {
      const meta = await getYoutubeVideoMetadata(videoId, ytApiKey.trim());
      if (meta) {
        rawTitleForLlm = meta.title;
        rawChannelForLlm = meta.channelTitle;
        // 1차적으로 빠른 렌더링을 위해 정규식으로 가공
        const cleaned = cleanYoutubeMetadata(meta.title, meta.channelTitle);
        if (!title) title = cleaned.title;
        if (!artist) artist = cleaned.artist;
        needLlmRefine = true;
      }
    }

    if (!title) title = '유튜브 동영상';
    if (!artist) artist = '알 수 없는 아티스트';

    let insertedTrack = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selectedPlaylistId);

    if (user && !user.isGuest && supabase && isUuid) {
      const { data, error } = await supabase
        .from('tracks')
        .insert({
          playlist_id: selectedPlaylistId,
          youtube_video_id: videoId,
          custom_title: title,
          custom_artist: artist,
          sequence: playlistLength,
          lyric_offset: 0
        })
        .select()
        .single();

      if (!error && data) {
        insertedTrack = data;
        onTrackInserted(data, needLlmRefine, rawTitleForLlm, rawChannelForLlm);
        showToast('곡을 등록했습니다.');
      } else if (error) {
        console.error('Failed to insert track to Supabase:', error);
        showToast('곡 등록에 실패했습니다.');
      }
    } else {
      const newTrack = {
        id: `tr-${Date.now()}`,
        playlist_id: selectedPlaylistId,
        youtube_video_id: videoId,
        custom_title: title,
        custom_artist: artist,
        lyric_offset: 0,
        custom_lyrics: '',
        sequence: playlistLength,
        created_at: new Date().toISOString()
      };

      const localTr = localStorage.getItem('sofar_tracks');
      const currentLocalTracks = localTr ? JSON.parse(localTr) : [];
      const updatedLocalTracks = [...currentLocalTracks, newTrack];
      
      localStorage.setItem('sofar_tracks', JSON.stringify(updatedLocalTracks));
      insertedTrack = newTrack;
      onTrackInserted(newTrack, needLlmRefine, rawTitleForLlm, rawChannelForLlm);
      showToast('곡을 등록했습니다.');
    }

    setYoutubeUrl('');
    setCustomTitle('');
    setCustomArtist('');
    setIsAddingTrack(false);
  };

  // 공통 검색 트리거 함수
  const triggerSearch = async (query) => {
    if (!query.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    setShowSuggestions(false);
    try {
      const results = await searchYoutube(query.trim(), ytApiKey.trim());
      setSearchResults(results);
      if (ytApiKey.trim()) {
        localStorage.setItem('sofar_yt_api_key', ytApiKey.trim());
      }
    } catch (err) {
      setSearchError(err.message || '검색 결과를 가져오지 못했습니다.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    triggerSearch(searchQuery);
  };

  const handleSuggestionClick = (suggestion) => {
    setSearchQuery(suggestion);
    triggerSearch(suggestion);
  };

  const handleAddSearchedTrack = async (searchItem) => {
    if (!selectedPlaylistId) {
      alert('플레이리스트를 먼저 선택해 주세요.');
      return;
    }

    let videoId = searchItem.youtube_video_id;
    const rawTitle = searchItem.rawTitle || searchItem.custom_title;
    const rawChannel = searchItem.rawChannel || searchItem.custom_artist;

    if (!videoId) {
      const searchKeyword = `${searchItem.custom_artist || ''} ${searchItem.custom_title || ''}`.trim();
      const ytResults = await searchYoutube(searchKeyword, searchItem.durationSec || 0);
      if (ytResults && ytResults.length > 0) {
        videoId = ytResults[0].youtube_video_id;
      }
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selectedPlaylistId);

    if (user && !user.isGuest && supabase && isUuid) {
      const { data, error } = await supabase
        .from('tracks')
        .insert({
          playlist_id: selectedPlaylistId,
          youtube_video_id: videoId || '',
          custom_title: searchItem.custom_title,
          custom_artist: searchItem.custom_artist,
          sequence: playlistLength,
          lyric_offset: 0
        })
        .select()
        .single();

      if (!error && data) {
        onTrackInserted(data, true, rawTitle, rawChannel);
        showToast('곡을 플레이리스트에 추가했습니다.');
      } else if (error) {
        console.error('Failed to insert track to Supabase:', error);
        showToast('곡 추가에 실패했습니다.');
      }
    } else {
      const newTrack = {
        id: `tr-${Date.now()}`,
        playlist_id: selectedPlaylistId,
        youtube_video_id: videoId || '',
        custom_title: searchItem.custom_title,
        custom_artist: searchItem.custom_artist,
        lyric_offset: 0,
        custom_lyrics: '',
        sequence: playlistLength,
        created_at: new Date().toISOString()
      };

      const localTr = localStorage.getItem('sofar_tracks');
      const currentLocalTracks = localTr ? JSON.parse(localTr) : [];
      const updatedLocalTracks = [...currentLocalTracks, newTrack];
      
      localStorage.setItem('sofar_tracks', JSON.stringify(updatedLocalTracks));
      onTrackInserted(newTrack, true, rawTitle, rawChannel);
      showToast('곡을 플레이리스트에 추가했습니다.');
    }
  };

  const handleAddSearchedTrackToQueue = (searchItem) => {
    const queueTrack = {
      id: `tr-queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      youtube_video_id: searchItem.youtube_video_id,
      custom_title: searchItem.custom_title,
      custom_artist: searchItem.custom_artist,
      lyric_offset: 0,
      custom_lyrics: '',
      thumbnail: searchItem.thumbnail
    };
    addToQueue(queueTrack, 'end');
  };

  // 검색어 일치 글자 강조 표시 (React 컴포넌트 맵핑 방식)
  const highlightMatch = (text, query) => {
    if (!query || !query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, index) => 
      regex.test(part) 
        ? <span key={index} className="search-highlight">{part}</span> 
        : part
    );
  };

  return (
    <>
      <button 
        onClick={() => setIsAddingTrack(true)} 
        className="track-add-toggle-btn"
      >
        <Plus size={12} />
        새로운 곡 추가하기
      </button>

      <Modal
        isOpen={isAddingTrack}
        title="새로운 곡 추가하기"
        onClose={() => {
          setIsAddingTrack(false);
          setSearchResults([]);
          setSuggestions([]);
        }}
        maxWidth="680px"
      >
        <div className="track-add-modal-container">
          {/* 탭 헤더 */}
          <div className="modal-tab-headers">
            <button 
              type="button" 
              onClick={() => setAddMethod('search')} 
              className={`modal-tab-btn ${addMethod === 'search' ? 'active' : ''}`}
            >
              <Search size={14} />
              유튜브 검색 등록
            </button>
            <button 
              type="button" 
              onClick={() => setAddMethod('url')} 
              className={`modal-tab-btn ${addMethod === 'url' ? 'active' : ''}`}
            >
              <Link size={14} />
              유튜브 링크 추가
            </button>
          </div>

          <div className="modal-tab-body">
            {addMethod === 'search' ? (
              <div className="search-tab-content">
                {/* 자동완성 드롭다운을 감싸는 폼 영역 */}
                <div className="autocomplete-wrapper" ref={autocompleteRef}>
                  <form onSubmit={handleSearch} className="modal-search-form">
                    <input 
                      type="text" 
                      placeholder="검색어를 입력해 주세요 (예: 노래 제목, 아티스트)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      required
                      className="input-cozy search-input"
                    />
                    <button type="submit" className="btn-small-primary search-submit-btn">
                      검색
                    </button>
                  </form>

                  {/* 자동완성 추천 창 */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="autocomplete-dropdown scrollbar-none">
                      {suggestions.map((suggestion, index) => (
                        <div 
                          key={index} 
                          className="autocomplete-item"
                          onClick={() => handleSuggestionClick(suggestion)}
                        >
                          <Search size={11} className="autocomplete-item-icon" />
                          <span className="autocomplete-item-text">
                            {highlightMatch(suggestion, searchQuery)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {searchLoading && (
                  <div className="search-status-message">
                    <div className="spinner"></div>
                    <span>유튜브 라이브러리 검색 중...</span>
                  </div>
                )}
                {searchError && <p className="search-error-message">{searchError}</p>}
                
                {/* 검색 결과 및 상단 컨트롤러 (개수 및 뷰 모드 토글) */}
                {searchResults.length > 0 && (
                  <div className="search-results-section">
                    <div className="search-results-header">
                      <span className="results-count">검색 결과 {searchResults.length}개</span>
                      <div className="view-mode-toggle-buttons">
                        <button 
                          onClick={() => setViewMode('list')}
                          className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
                          title="리스트 형태로 보기"
                        >
                          <List size={14} />
                        </button>
                        <button 
                          onClick={() => setViewMode('grid')}
                          className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
                          title="그리드 형태로 보기"
                        >
                          <LayoutGrid size={14} />
                        </button>
                      </div>
                    </div>

                    <div className={`modal-search-results scrollbar-none ${viewMode}-view`}>
                      {searchResults.map((item) => (
                        viewMode === 'list' ? (
                          /* 리스트 뷰 아이템 */
                          <div key={item.youtube_video_id} className="modal-search-row">
                            <div className="modal-search-meta">
                              <img 
                                src={item.thumbnail} 
                                alt="" 
                                className="modal-search-thumbnail" 
                              />
                              <div className="modal-search-texts">
                                <p className="modal-search-title" title={item.custom_title}>
                                  {item.custom_title}
                                </p>
                                <p className="modal-search-artist">
                                  {item.custom_artist}
                                </p>
                              </div>
                            </div>
                            <div className="modal-search-actions">
                              <button 
                                onClick={() => {
                                  playTrack(item);
                                  showToast('곡 재생을 시작합니다.');
                                }} 
                                className="modal-action-btn"
                                title="바로 감상하기"
                              >
                                <Play size={12} fill="currentColor" />
                                <span>바로 재생</span>
                              </button>
                              <button 
                                onClick={() => handleAddSearchedTrackToQueue(item)} 
                                className="modal-action-btn accent"
                                title="대기열에 추가"
                              >
                                <ListPlus size={12} />
                                <span>대기열 추가</span>
                              </button>
                              <button 
                                onClick={() => handleAddSearchedTrack(item)} 
                                className="modal-action-btn primary"
                                title="플레이리스트에 추가"
                              >
                                <Plus size={12} />
                                <span>보관함 추가</span>
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* 그리드 카드 뷰 아이템 */
                          <div key={item.youtube_video_id} className="modal-search-card">
                            <div className="card-thumbnail-container">
                              <img 
                                src={item.thumbnail} 
                                alt="" 
                                className="modal-search-card-thumbnail" 
                              />
                            </div>
                            <div className="modal-search-card-texts">
                              <p className="modal-search-card-title" title={item.custom_title}>
                                {item.custom_title}
                              </p>
                              <p className="modal-search-card-artist">
                                {item.custom_artist}
                              </p>
                            </div>
                            <div className="modal-search-card-actions">
                              <button 
                                onClick={() => {
                                  playTrack(item);
                                  showToast('곡 재생을 시작합니다.');
                                }} 
                                className="modal-card-action-btn"
                                title="바로 감상하기"
                              >
                                <Play size={11} fill="currentColor" />
                              </button>
                              <button 
                                onClick={() => handleAddSearchedTrackToQueue(item)} 
                                className="modal-card-action-btn accent"
                                title="대기열에 추가"
                              >
                                <ListPlus size={11} />
                              </button>
                              <button 
                                onClick={() => handleAddSearchedTrack(item)} 
                                className="modal-card-action-btn primary"
                                title="플레이리스트에 추가"
                              >
                                <Plus size={11} />
                              </button>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleAddTrack} className="url-tab-content">
                <div className="form-group-cozy">
                  <label>유튜브 URL 주소</label>
                  <input 
                    type="text" 
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    required
                    className="input-cozy"
                  />
                </div>
                <div className="form-row-cozy">
                  <div className="form-group-cozy">
                    <label>곡 제목 (선택)</label>
                    <input 
                      type="text" 
                      placeholder="제목 입력창 (비워둘 시 자동 추출)"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="input-cozy"
                    />
                  </div>
                  <div className="form-group-cozy">
                    <label>아티스트 (선택)</label>
                    <input 
                      type="text" 
                      placeholder="아티스트 입력창 (비워둘 시 자동 추출)"
                      value={customArtist}
                      onChange={(e) => setCustomArtist(e.target.value)}
                      className="input-cozy"
                    />
                  </div>
                </div>
                <button type="submit" className="btn-small-primary url-submit-btn">
                  곡 등록 완료
                </button>
              </form>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
