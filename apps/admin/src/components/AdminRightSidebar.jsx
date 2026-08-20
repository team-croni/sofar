import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  X, Music, Search, Copy, ExternalLink, 
  ArrowRight, ArrowLeft, Loader2, Check, Sparkles, RefreshCw,
  Link2, Trash2, Link2Off, Plus, AlertTriangle, Clock, History,
  TriangleAlert
} from 'lucide-react';
import { Button, Input, Modal } from './ui';
import { useAdmin } from '../context/AdminContext';
import { setDragGhost } from '../utils/dragUtils';
import './AdminRightSidebar.css';

const YoutubeIcon = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function AdminRightSidebar() {
  const location = useLocation();
  const isEditorPage = location.pathname.startsWith('/playlist/');

  const {
    isRightSidebarOpen,
    toggleRightSidebar,
    rightSidebarTab,
    setRightSidebarTab,
    rightSidebarQuery,
    setRightSidebarQuery,
    selectedDetail,
    setSelectedDetail,
    songInput,
    setSongInput,
    songResults,
    setSongResults,
    songLoading,
    setSongLoading,
    songHasSearched,
    setSongHasSearched,
    lastSearchedSongQuery,
    setLastSearchedSongQuery,
    youtubeInput,
    setYoutubeInput,
    youtubeResults,
    setYoutubeResults,
    youtubeLoading,
    setYoutubeLoading,
    youtubeHasSearched,
    setYoutubeHasSearched,
    lastSearchedYoutubeQuery,
    setLastSearchedYoutubeQuery,
  } = useAdmin();

  // 복사 피드백 아이콘 상태
  const [copiedId, setCopiedId] = useState(null);

  // 검색 결과 상세 모달 상태
  const [songYoutubeCandidates, setSongYoutubeCandidates] = useState([]);
  const [songYoutubeLoading, setSongYoutubeLoading] = useState(false);
  const [isModalScrolled, setIsModalScrolled] = useState(false);
  const [savedMapping, setSavedMapping] = useState(null);
  const [mappingLoadingId, setMappingLoadingId] = useState(null);
  const [customMappingInput, setCustomMappingInput] = useState('');

  // 전역 query 변경 감지 (노래 탭에서 유튜브 검색으로 넘어올 때)
  useEffect(() => {
    if (rightSidebarQuery && rightSidebarQuery !== lastSearchedYoutubeQuery) {
      setYoutubeInput(rightSidebarQuery);
      executeYoutubeSearch(rightSidebarQuery);
    }
  }, [rightSidebarQuery]);

  // 노래 입력 디바운스 자동 검색
  useEffect(() => {
    const trimmed = songInput.trim();
    if (!trimmed) {
      if (songResults.length > 0 || songHasSearched) {
        setSongResults([]);
        setSongHasSearched(false);
        setLastSearchedSongQuery('');
      }
      return;
    }

    if (trimmed === lastSearchedSongQuery) {
      return;
    }

    const timer = setTimeout(() => {
      executeSongSearch(trimmed);
    }, 400);

    return () => clearTimeout(timer);
  }, [songInput, lastSearchedSongQuery]);

  // 유튜브 입력 디바운스 자동 검색
  useEffect(() => {
    const trimmed = youtubeInput.trim();
    if (!trimmed) {
      if (youtubeResults.length > 0 || youtubeHasSearched) {
        setYoutubeResults([]);
        setYoutubeHasSearched(false);
        setLastSearchedYoutubeQuery('');
      }
      return;
    }

    if (trimmed === lastSearchedYoutubeQuery) {
      return;
    }

    const timer = setTimeout(() => {
      executeYoutubeSearch(trimmed);
    }, 400);

    return () => clearTimeout(timer);
  }, [youtubeInput, lastSearchedYoutubeQuery]);

  // 노래 상세 모달 열릴 때 수동 매칭 정보 및 추천 유튜브 후보 자동 조회 & 메타데이터 보강
  useEffect(() => {
    setIsModalScrolled(false);
    setCustomMappingInput('');
    if (selectedDetail && selectedDetail.type === 'song') {
      const songItem = selectedDetail.item;
      const q = `${songItem.artist || ''} ${songItem.title || ''}`.trim() || songItem.searchQuery || '';
      let isMounted = true;

      // 1) 앨범 커버 및 상세 정보가 부족한 경우 iTunes API로 자동 보강
      if (!songItem.artwork || !songItem.album || !songItem.durationSec) {
        fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&country=KR&lang=ko_kr&limit=1`)
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            if (!isMounted) return;
            if (json && json.results && json.results.length > 0) {
              const it = json.results[0];
              const rawArtwork = it.artworkUrl100 || '';
              const artworkUrl = rawArtwork ? rawArtwork.replace('100x100bb', '600x600bb') : '';
              const durationSec = it.trackTimeMillis ? Math.round(it.trackTimeMillis / 1000) : 0;

              setSelectedDetail((prev) => {
                if (prev && prev.type === 'song' && prev.item.title === songItem.title) {
                  return {
                    ...prev,
                    item: {
                      ...prev.item,
                      artwork: prev.item.artwork || artworkUrl,
                      album: prev.item.album || it.collectionName || '',
                      durationSec: prev.item.durationSec || durationSec,
                      itunesTrackId: it.trackId || prev.item.itunesTrackId || '',
                    },
                  };
                }
                return prev;
              });
            }
          })
          .catch(() => {});
      }

      // 2) 수동 매칭 조회 및 3) 유튜브 후보 검색 병합 처리
      const loadCandidatesAndMapping = async () => {
        setSongYoutubeLoading(true);

        try {
          // 수동 매칭 여부 서버 조회
          const isNumericId = songItem.itunesTrackId || (typeof songItem.id === 'number' || (typeof songItem.id === 'string' && /^\d+$/.test(songItem.id)));
          const trackIdParam = isNumericId ? `&trackId=${encodeURIComponent(songItem.itunesTrackId || songItem.id)}` : '';
          
          let fetchedMapping = null;
          try {
            const mapRes = await fetch(`${API_BASE}/api/chart/song-mapping?query=${encodeURIComponent(q)}${trackIdParam}`);
            if (mapRes.ok) {
              const mapJson = await mapRes.json();
              if (mapJson && mapJson.success && mapJson.data) {
                fetchedMapping = mapJson.data;
                if (isMounted) setSavedMapping(fetchedMapping);
              } else {
                if (isMounted) setSavedMapping(null);
              }
            }
          } catch (e) {}

          // 유튜브 후보 검색
          let candidates = [];
          try {
            const ytRes = await fetch(`${API_BASE}/api/chart/search-youtube?q=${encodeURIComponent(q)}`);
            if (ytRes.ok) {
              const ytJson = await ytRes.json();
              if (ytJson && ytJson.success && Array.isArray(ytJson.data)) {
                candidates = ytJson.data;
              }
            }
          } catch (e) {}

          // 1. 특수 영상 ID 식별 (수동 매칭 영상, 불일치 신고된 모든 영상들)
          const specialIds = [];
          const specialIdSet = new Set();

          // (A) 수동 매칭된 영상 ID
          if (fetchedMapping?.youtube_video_id) {
            specialIds.push({ id: fetchedMapping.youtube_video_id, type: 'manual' });
            specialIdSet.add(fetchedMapping.youtube_video_id);
          }

          // (B) 불일치 신고된 모든 영상 ID들
          if (songItem.mismatchLogs && Array.isArray(songItem.mismatchLogs)) {
            songItem.mismatchLogs.forEach((l) => {
              if (l.youtube_video_id && !specialIdSet.has(l.youtube_video_id)) {
                specialIds.push({ id: l.youtube_video_id, type: 'mismatch', log: l });
                specialIdSet.add(l.youtube_video_id);
              }
            });
          }
          if (songItem.isMismatchReport && songItem.youtube_video_id && !specialIdSet.has(songItem.youtube_video_id)) {
            specialIds.push({ id: songItem.youtube_video_id, type: 'mismatch' });
            specialIdSet.add(songItem.youtube_video_id);
          }

          // 2. 특수 영상 객체 목록 구성 (검색 결과에 있으면 가져오고, 없으면 단건 메타 조회)
          const specialItems = [];
          for (const item of specialIds) {
            const inList = candidates.find((c) => c.youtube_video_id === item.id);
            if (inList) {
              specialItems.push(inList);
            } else {
              let synth = {
                youtube_video_id: item.id,
                custom_title: songItem.title ? `${songItem.title} - ${songItem.artist}` : (songItem.searchQuery || '영상'),
                custom_artist: songItem.artist || '',
                thumbnail: item.log?.thumbnail || `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`,
                durationSec: songItem.durationSec || 0,
              };
              try {
                const singleRes = await fetch(`${API_BASE}/api/chart/search-youtube?q=${encodeURIComponent(item.id)}`);
                if (singleRes.ok) {
                  const singleJson = await singleRes.json();
                  if (singleJson && singleJson.success && Array.isArray(singleJson.data) && singleJson.data.length > 0) {
                    const meta = singleJson.data[0];
                    synth = {
                      ...synth,
                      custom_title: meta.custom_title || synth.custom_title,
                      custom_artist: meta.custom_artist || synth.custom_artist,
                      durationSec: meta.durationSec || synth.durationSec,
                      thumbnail: meta.thumbnail || synth.thumbnail,
                      viewCountText: meta.viewCountText,
                      publishedTimeText: meta.publishedTimeText,
                    };
                  }
                }
              } catch (e) {}
              specialItems.push(synth);
            }
          }

          // 3. 특수 영상들을 제외한 순수한 일반 추천 후보 영상 6개 추출
          const normalCandidates = candidates
            .filter((c) => c.youtube_video_id && !specialIdSet.has(c.youtube_video_id))
            .slice(0, 6);

          // 4. 최종 목록: [특수 영상들 (매칭됨, 신고됨)] + [추가 일반 추천 영상 6개]
          const finalCandidates = [...specialItems, ...normalCandidates];

          if (isMounted) {
            setSongYoutubeCandidates(finalCandidates);
          }
        } catch (e) {
          if (isMounted) setSongYoutubeCandidates([]);
        } finally {
          if (isMounted) setSongYoutubeLoading(false);
        }
      };

      loadCandidatesAndMapping();

      return () => {
        isMounted = false;
      };
    } else {
      setSavedMapping(null);
      setSongYoutubeCandidates([]);
    }
  }, [selectedDetail?.type === 'song' ? `${selectedDetail?.item?.artist}-${selectedDetail?.item?.title}-${selectedDetail?.item?.youtube_video_id}` : selectedDetail]);

  // 유튜브 상세 모달 열릴 때 비디오 메타데이터(조회수, 게시일, 채널명 등) 자동 보강
  useEffect(() => {
    if (selectedDetail && selectedDetail.type === 'youtube' && selectedDetail.item?.youtube_video_id) {
      const vid = selectedDetail.item.youtube_video_id;
      fetch(`${API_BASE}/api/chart/search-youtube?q=${encodeURIComponent(vid)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json && json.success && Array.isArray(json.data) && json.data.length > 0) {
            const enriched = json.data[0];
            setSelectedDetail((prev) => {
              if (prev && prev.type === 'youtube' && prev.item.youtube_video_id === vid) {
                return {
                  ...prev,
                  item: {
                    ...prev.item,
                    custom_title: enriched.custom_title || prev.item.custom_title,
                    custom_artist: enriched.custom_artist || prev.item.custom_artist,
                    durationSec: enriched.durationSec || prev.item.durationSec,
                    viewCountText: enriched.viewCountText || prev.item.viewCountText,
                    publishedTimeText: enriched.publishedTimeText || prev.item.publishedTimeText,
                  },
                };
              }
              return prev;
            });
          }
        })
        .catch(() => {});
    }
  }, [selectedDetail?.type, selectedDetail?.item?.youtube_video_id]);

  // 수동 매칭 확정 / 해제 토글 처리
  const handleToggleSongMapping = async (candidate) => {
    if (!selectedDetail || selectedDetail.type !== 'song') return;
    const songItem = selectedDetail.item;
    const q = `${songItem.artist} ${songItem.title}`;
    const isCurrentlySaved = savedMapping && savedMapping.youtube_video_id === candidate.youtube_video_id;

    setMappingLoadingId(candidate.youtube_video_id);

    try {
      if (isCurrentlySaved) {
        // 매칭 해제
        await fetch(`${API_BASE}/api/chart/delete-song-mapping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, trackId: songItem.id }),
        });
        setSavedMapping(null);
      } else {
        // 수동 매칭 확정 저장
        const res = await fetch(`${API_BASE}/api/chart/song-mapping`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: q,
            trackId: songItem.id,
            youtube_video_id: candidate.youtube_video_id,
            durationSec: candidate.durationSec || 0,
          }),
        });
        const json = await res.json();
        if (json && json.success) {
          setSavedMapping({
            youtube_video_id: candidate.youtube_video_id,
            durationSec: candidate.durationSec,
          });
        }
      }
    } catch (err) {
      console.error('Failed to toggle song mapping', err);
    } finally {
      setMappingLoadingId(null);
    }
  };

  const extractYoutubeId = (urlOrId) => {
    if (!urlOrId) return '';
    const trimmed = urlOrId.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : trimmed;
  };

  const handleSaveCustomMapping = async () => {
    if (!selectedDetail || selectedDetail.type !== 'song' || !customMappingInput.trim()) return;
    const videoId = extractYoutubeId(customMappingInput);
    if (!videoId) return;

    const songItem = selectedDetail.item;
    const q = `${songItem.artist} ${songItem.title}`;
    setMappingLoadingId('custom');

    try {
      const res = await fetch(`${API_BASE}/api/chart/song-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          trackId: songItem.id,
          youtube_video_id: videoId,
          durationSec: 0,
        }),
      });
      const json = await res.json();
      if (json && json.success) {
        setSavedMapping({
          youtube_video_id: videoId,
          durationSec: 0,
        });
        setCustomMappingInput('');
      }
    } catch (err) {
      console.error('Failed to save custom mapping', err);
    } finally {
      setMappingLoadingId(null);
    }
  };

  const handleAddTrackToEditor = (trackData, e) => {
    if (e) e.stopPropagation();
    const event = new CustomEvent('sofar-add-track', { detail: trackData });
    window.dispatchEvent(event);
  };

  const handleModalScroll = (e) => {
    if (e.target && e.target.scrollTop > 130) {
      setIsModalScrolled(true);
    } else {
      setIsModalScrolled(false);
    }
  };

  const setCopiedFeedback = (id) => {
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId(null);
    }, 1500);
  };

  // 1) 노래 검색 (iTunes Search API 사용)
  const executeSongSearch = async (queryStr) => {
    const q = (queryStr || songInput).trim();
    if (!q) return;

    setSongLoading(true);
    setSongHasSearched(true);
    setLastSearchedSongQuery(q);
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&country=KR&lang=ko_kr&limit=25`
      );
      if (res.ok) {
        const json = await res.json();
        if (json.results && Array.isArray(json.results)) {
          const formatted = json.results.map((item) => {
            const durationSec = item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 0;
            const rawArtwork = item.artworkUrl100 || '';
            const artwork = rawArtwork ? rawArtwork.replace('100x100bb', '600x600bb') : '';
            return {
              id: item.trackId,
              title: item.trackName || '제목 없음',
              artist: item.artistName || '아티스트 없음',
              album: item.collectionName || '',
              durationSec,
              artwork,
            };
          });
          setSongResults(formatted);
        } else {
          setSongResults([]);
        }
      }
    } catch (err) {
      console.warn('Song search error:', err);
      setSongResults([]);
    } finally {
      setSongLoading(false);
    }
  };

  // 2) 유튜브 영상 검색 (Backend API 사용 & URL/Video ID 직접 입력 처리)
  const executeYoutubeSearch = async (queryStr) => {
    const q = (queryStr !== undefined ? queryStr : youtubeInput).trim();
    if (!q) return;

    setYoutubeLoading(true);
    setYoutubeHasSearched(true);
    setLastSearchedYoutubeQuery(q);

    try {
      // URL 또는 11자리 비디오 ID 직접 입력 감지
      let extractedId = q;
      if (extractedId.includes('v=')) {
        extractedId = extractedId.split('v=')[1].split('&')[0];
      } else if (extractedId.includes('youtu.be/')) {
        extractedId = extractedId.split('youtu.be/')[1].split('?')[0];
      }

      if (extractedId.length === 11 && !extractedId.includes(' ')) {
        // 단일 비디오 ID 카드 생성
        setYoutubeResults([
          {
            youtube_video_id: extractedId,
            custom_title: `유튜브 영상 (${extractedId})`,
            custom_artist: '직접 입력한 비디오 ID',
            thumbnail: `https://img.youtube.com/vi/${extractedId}/hqdefault.jpg`,
            durationSec: 0,
          },
        ]);
      } else {
        // 백엔드 YouTube 검색 API 호출
        const res = await fetch(
          `${API_BASE}/api/chart/search-youtube?q=${encodeURIComponent(q)}`
        );
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            setYoutubeResults(json.data);
          } else {
            setYoutubeResults([]);
          }
        }
      }
    } catch (err) {
      console.warn('YouTube search error:', err);
      setYoutubeResults([]);
    } finally {
      setYoutubeLoading(false);
    }
  };

  // 노래 탭 -> 유튜브 매칭 검색 버튼 클릭 핸들러
  const handleSearchYoutubeFromSong = (song) => {
    const query = `${song.artist} ${song.title}`;
    setRightSidebarQuery(query);
    setYoutubeInput(query);
    setRightSidebarTab('youtube');
    executeYoutubeSearch(query);
  };

  // Video ID 복사 핸들러
  const handleCopyVideoId = (videoId) => {
    navigator.clipboard.writeText(videoId);
    setCopiedFeedback(videoId);
  };

  // 곡명/아티스트 복사 핸들러
  const handleCopySongInfo = (song) => {
    const text = `${song.artist} - ${song.title}`;
    navigator.clipboard.writeText(text);
    setCopiedFeedback(song.id);
  };

  const formatDuration = (sec) => {
    if (!sec || sec <= 0) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <aside className={`admin-right-sidebar ${isRightSidebarOpen ? 'open' : ''}`}>
      {/* ── 탭 네비게이션 ── */}
      <div className="admin-right-sidebar-tabs">
        <button
          type="button"
          className={`sidebar-tab-btn ${rightSidebarTab === 'song' ? 'active' : ''}`}
          onClick={() => setRightSidebarTab('song')}
        >
          <Music size={14} />
          <span>노래 검색</span>
        </button>
        <button
          type="button"
          className={`sidebar-tab-btn ${rightSidebarTab === 'youtube' ? 'active' : ''}`}
          onClick={() => setRightSidebarTab('youtube')}
        >
          <YoutubeIcon size={15} />
          <span>유튜브 검색</span>
        </button>
      </div>

      {/* ── 탭 콘텐츠 영역 ── */}
      <div className="admin-right-sidebar-content">
        {/* TAB 1: 노래 검색 */}
        {rightSidebarTab === 'song' && (
          <div className="tab-pane">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeSongSearch(songInput);
              }}
              className="sidebar-search-form"
            >
              <div className="sidebar-search-input-wrapper">
                {songLoading ? (
                  <Loader2 size={18} className="search-input-icon animate-spin" />
                ) : (
                  <Search size={18} className="search-input-icon" />
                )}
                <input
                  type="text"
                  className="sidebar-search-input"
                  placeholder="곡명, 아티스트 또는 앨범 검색..."
                  value={songInput}
                  onChange={(e) => setSongInput(e.target.value)}
                />
                {songInput && (
                  <button
                    type="button"
                    className="input-clear-btn"
                    onClick={() => {
                      setSongInput('');
                      setSongResults([]);
                      setSongHasSearched(false);
                      setLastSearchedSongQuery('');
                    }}
                    title="검색어 지우기"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </form>

            <div className="sidebar-results-container scrollbar-none">
              {songLoading ? (
                <div className="sidebar-state-empty">
                  <Loader2 size={24} className="animate-spin" />
                  <p>음원 검색 중...</p>
                </div>
              ) : songResults.length > 0 ? (
                <div className="song-result-list">
                  {songResults.map((song) => (
                    <div
                      key={song.id}
                      className="song-result-card draggable-card"
                      draggable="true"
                      onClick={() => setSelectedDetail({ type: 'song', item: song })}
                      onDragStart={(e) => {
                        const dragData = {
                          type: 'sofar-track',
                          id: song.id,
                          trackId: song.itunesTrackId || song.id,
                          custom_title: song.title,
                          custom_artist: song.artist,
                          youtube_video_id: song.youtube_video_id || '',
                          thumbnail: song.artwork || '',
                          source: 'itunes',
                        };
                        e.dataTransfer.setData('application/json', JSON.stringify(dragData));
                        e.dataTransfer.setData('text/plain', `${song.artist} - ${song.title}`);
                        e.dataTransfer.effectAllowed = 'copy';
                        setDragGhost(e, {
                          title: song.title,
                          artist: song.artist,
                          artwork: song.artwork,
                        });
                      }}
                    >
                      <div className="song-card-cover">
                        {song.artwork ? (
                          <img src={song.artwork} alt={song.title} />
                        ) : (
                          <div className="song-card-cover-fallback">
                            <Music size={18} />
                          </div>
                        )}
                      </div>

                      <div className="song-card-info">
                        <div className="song-card-title">{song.title}</div>
                        <div className="song-card-artist">{song.artist}</div>
                        {song.durationSec > 0 && (
                          <span className="song-card-duration">
                            {formatDuration(song.durationSec)}
                          </span>
                        )}
                      </div>

                      <div
                        className="song-card-actions"
                        draggable="true"
                        onDragStart={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        {isEditorPage && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={(e) =>
                              handleAddTrackToEditor(
                                {
                                  custom_title: song.title,
                                  custom_artist: song.artist,
                                  youtube_video_id: '',
                                },
                                e,
                              )
                            }
                            title="큐레이션 수록곡으로 1-Click 추가"
                            leadingIcon={<Plus size={14} />}
                          />
                        )}
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSearchYoutubeFromSong(song);
                          }}
                          title="이 곡으로 유튜브 후보 영상 검색"
                          leadingIcon={<ArrowRight size={14} />}
                        />
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopySongInfo(song);
                          }}
                          title="곡 정보 복사"
                          leadingIcon={
                            copiedId === song.id ? <Check size={12} /> : <Copy size={12} />
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : songHasSearched ? (
                <div className="sidebar-state-empty">
                  <p>검색 결과가 없습니다.</p>
                  <span>곡명이나 아티스트명을 다시 확인해보세요.</span>
                </div>
              ) : (
                <div className="sidebar-state-empty">
                  <Music size={36} className="empty-icon" />
                  <p>노래 검색</p>
                  <span>노래 정보를 검색하여 유튜브 영상과 매칭할 수 있습니다.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: 유튜브 영상 검색 */}
        {rightSidebarTab === 'youtube' && (
          <div className="tab-pane">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeYoutubeSearch(youtubeInput);
              }}
              className="sidebar-search-form"
            >
              <div className="sidebar-search-input-wrapper">
                {youtubeLoading ? (
                  <Loader2 size={18} className="search-input-icon youtube-icon animate-spin" />
                ) : (
                  <YoutubeIcon size={18} className="search-input-icon youtube-icon" />
                )}
                <input
                  type="text"
                  className="sidebar-search-input"
                  placeholder="검색어 또는 유튜브 URL/비디오ID..."
                  value={youtubeInput}
                  onChange={(e) => setYoutubeInput(e.target.value)}
                />
                {youtubeInput && (
                  <button
                    type="button"
                    className="input-clear-btn"
                    onClick={() => {
                      setYoutubeInput('');
                      setYoutubeResults([]);
                      setYoutubeHasSearched(false);
                      setLastSearchedYoutubeQuery('');
                    }}
                    title="검색어 지우기"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </form>

            <div className="sidebar-results-container scrollbar-none">
              {youtubeLoading ? (
                <div className="sidebar-state-empty">
                  <Loader2 size={24} className="animate-spin" />
                  <p>유튜브 영상 검색 중...</p>
                </div>
              ) : youtubeResults.length > 0 ? (
                <div className="youtube-result-list">
                  {youtubeResults.map((yt, idx) => (
                    <div
                      key={yt.youtube_video_id || idx}
                      className="yt-result-card draggable-card"
                      draggable="true"
                      onClick={() => setSelectedDetail({ type: 'youtube', item: yt })}
                      onDragStart={(e) => {
                        const dragData = {
                          type: 'sofar-track',
                          custom_title: yt.custom_title,
                          custom_artist: yt.custom_artist,
                          youtube_video_id: yt.youtube_video_id,
                          source: 'youtube',
                        };
                        e.dataTransfer.setData('application/json', JSON.stringify(dragData));
                        e.dataTransfer.setData('text/plain', yt.youtube_video_id);
                        e.dataTransfer.effectAllowed = 'copy';
                        setDragGhost(e, {
                          custom_title: yt.custom_title,
                          custom_artist: yt.custom_artist,
                          thumbnail: yt.thumbnail,
                          youtube_video_id: yt.youtube_video_id,
                        });
                      }}
                    >
                      <div className="yt-card-thumbnail">
                        <img
                          src={
                            yt.thumbnail ||
                            `https://img.youtube.com/vi/${yt.youtube_video_id}/hqdefault.jpg`
                          }
                          alt={yt.custom_title}
                        />
                        {yt.durationSec > 0 && (
                          <span className="yt-card-duration">
                            {formatDuration(yt.durationSec)}
                          </span>
                        )}

                        <div
                          className="yt-card-actions overlay"
                          draggable="true"
                          onDragStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          {isEditorPage && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={(e) =>
                                handleAddTrackToEditor(
                                  {
                                    custom_title: yt.custom_title,
                                    custom_artist: yt.custom_artist,
                                    youtube_video_id: yt.youtube_video_id,
                                  },
                                  e,
                                )
                              }
                              title="큐레이션 수록곡으로 1-Click 추가"
                              leadingIcon={<Plus size={14} />}
                            />
                          )}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyVideoId(yt.youtube_video_id);
                            }}
                            title="YouTube Video ID 복사"
                            leadingIcon={
                              copiedId === yt.youtube_video_id ? <Check size={14} /> : <Copy size={14} />
                            }
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`https://www.youtube.com/watch?v=${yt.youtube_video_id}`, '_blank');
                            }}
                            title="새 탭에서 유튜브 영상 열기"
                            leadingIcon={<ExternalLink size={14} />}
                          />
                        </div>
                      </div>

                      <div className="yt-card-info-wrapper">
                        <div className="yt-card-info">
                          <div className="yt-card-title">{yt.custom_title}</div>
                          <div className="yt-card-channel">{yt.custom_artist}</div>
                          {(yt.viewCountText || yt.publishedTimeText) && (
                            <div className="yt-card-meta">
                              {yt.viewCountText && <span className="yt-meta-views">{yt.viewCountText}</span>}
                              {yt.viewCountText && yt.publishedTimeText && <span className="yt-meta-dot">•</span>}
                              {yt.publishedTimeText && <span className="yt-meta-published">{yt.publishedTimeText}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : youtubeHasSearched ? (
                <div className="sidebar-state-empty">
                  <p>유튜브 영상 검색 결과가 없습니다.</p>
                  <span>검색어를 다르게 시도해보세요.</span>
                </div>
              ) : (
                <div className="sidebar-state-empty">
                  <YoutubeIcon size={36} className="empty-icon youtube-icon" />
                  <p>유튜브 검색</p>
                  <span>유튜브 영상을 검색해서 Video ID를 추출하고 복사할 수 있습니다.</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── 상세 정보 모달 ── */}
      <Modal
        key={selectedDetail?.type === 'song' ? `song-modal-${selectedDetail?.item?.id}` : `yt-modal-${selectedDetail?.item?.youtube_video_id}`}
        isOpen={Boolean(selectedDetail)}
        onClose={() => setSelectedDetail(null)}
        size={selectedDetail?.type === 'song' ? 'lg' : 'md'}
        title={selectedDetail?.type === 'song' ? '노래 상세 정보' : '유튜브 영상 상세 정보'}
        bodyOnScroll={handleModalScroll}
        footer={
          selectedDetail?.type === 'song' ? (
            <div key={`footer-song-${selectedDetail?.item?.id}`} className="sidebar-detail-footer">
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<Search size={14} />}
                onClick={() => {
                  handleSearchYoutubeFromSong(selectedDetail.item);
                  setSelectedDetail(null);
                }}
              >
                유튜브 검색
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={copiedId === selectedDetail.item.id ? <Check size={14} /> : <Copy size={14} />}
                onClick={() => handleCopySongInfo(selectedDetail.item)}
              >
                곡 정보 복사
              </Button>
            </div>
          ) : selectedDetail?.type === 'youtube' ? (
            <div key={`footer-yt-${selectedDetail?.item?.youtube_video_id}`} className="sidebar-detail-footer">
              {selectedDetail?.fromSong ? (
                <Button
                  variant="ghost"
                  size="sm"
                  leadingIcon={<ArrowLeft size={14} />}
                  onClick={() => setSelectedDetail({ type: 'song', item: selectedDetail.fromSong })}
                  className="footer-back-btn"
                >
                  돌아가기
                </Button>
              ) : <div />}
              
              <div className="footer-actions-right">
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={<ExternalLink size={14} />}
                  onClick={() => window.open(`https://www.youtube.com/watch?v=${selectedDetail.item.youtube_video_id}`, '_blank')}
                >
                  유튜브에서 보기
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leadingIcon={copiedId === selectedDetail.item.youtube_video_id ? <Check size={14} /> : <Copy size={14} />}
                  onClick={() => handleCopyVideoId(selectedDetail.item.youtube_video_id)}
                >
                  Video ID 복사
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {selectedDetail?.type === 'song' && (
          <div className="sidebar-detail-modal">
            {/* ── 애니메이션으로 슬라이드 다운되는 스티키 컴팩트 헤더 ── */}
            <div className={`sidebar-compact-sticky-bar ${isModalScrolled ? 'show' : ''}`}>
              <div className="compact-bar-inner">
                <div className="compact-bar-media">
                  {selectedDetail.item.artwork ? (
                    <img src={selectedDetail.item.artwork} alt={selectedDetail.item.title} />
                  ) : (
                    <Music size={16} />
                  )}
                </div>
                <div className="compact-bar-info">
                  <div className="compact-bar-title">{selectedDetail.item.title}</div>
                  <div className="compact-bar-subtitle">{selectedDetail.item.artist}</div>
                </div>
                {selectedDetail.item.durationSec > 0 && (
                  <span className="compact-bar-duration">
                    {formatDuration(selectedDetail.item.durationSec)}
                  </span>
                )}
              </div>
            </div>

            {/* ── 기본 풀 사이즈 노래 헤더 (스크롤 시 자연스럽게 올라감) ── */}
            <div className="sidebar-detail-song-header">
              <div className="sidebar-detail-media song-media">
                {selectedDetail.item.artwork ? (
                  <img src={selectedDetail.item.artwork} alt={selectedDetail.item.title} className="detail-cover-img" />
                ) : (
                  <div className="detail-cover-fallback">
                    <Music size={36} />
                  </div>
                )}
              </div>
              <div className="sidebar-detail-info">
                <h3 className="detail-title">{selectedDetail.item.title}</h3>
                <p className="detail-subtitle">{selectedDetail.item.artist}</p>

                <div className="detail-meta-group">
                  {selectedDetail.item.album && (
                    <div className="detail-meta-row">
                      <span className="meta-label">앨범</span>
                      <span className="meta-value">{selectedDetail.item.album}</span>
                    </div>
                  )}
                  {selectedDetail.item.durationSec > 0 && (
                    <div className="detail-meta-row">
                      <span className="meta-label">재생 시간</span>
                      <span className="meta-value">{formatDuration(selectedDetail.item.durationSec)}</span>
                    </div>
                  )}
                  {(selectedDetail.item.itunesTrackId || (typeof selectedDetail.item.id === 'number' || (typeof selectedDetail.item.id === 'string' && /^\d+$/.test(selectedDetail.item.id)))) && (
                    <div className="detail-meta-row">
                      <span className="meta-label">iTunes Track ID</span>
                      <span className="meta-value code-font">{selectedDetail.item.itunesTrackId || selectedDetail.item.id}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── 매칭 유튜브 Video ID 정보 및 수동 매칭 관리 섹션 ── */}
            <div className="detail-manual-mapping-section">
              <div className="detail-section-header">
                <div className="detail-section-title">
                  <Link2 size={16} className="youtube-icon" />
                  <span>매칭 유튜브 Video ID</span>
                </div>
              </div>

              {savedMapping ? (
                <div className="saved-mapping-card">
                  <div className="saved-mapping-info">
                    <span className="saved-mapping-badge-manual">
                      <Link2 size={12} /> 수동 매칭됨 (DB 고정)
                    </span>
                    <span className="saved-mapping-id code-font">{savedMapping.youtube_video_id}</span>
                  </div>
                  <div className="saved-mapping-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setSelectedDetail({
                          type: 'youtube',
                          item: {
                            youtube_video_id: savedMapping.youtube_video_id,
                            custom_title: `${selectedDetail.item.title} - ${selectedDetail.item.artist}`,
                            custom_artist: selectedDetail.item.artist,
                            durationSec: savedMapping.durationSec || 0,
                          },
                          fromSong: selectedDetail.item,
                        })
                      }
                      title="유튜브 상세 보기"
                      leadingIcon={<ExternalLink size={14} />}
                    />
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() =>
                        handleToggleSongMapping({ youtube_video_id: savedMapping.youtube_video_id })
                      }
                      title="수동 매칭 해제"
                      leadingIcon={<Trash2 size={14} />}
                    />
                  </div>
                </div>
              ) : (
                <div className="manual-mapping-input-group">
                  <Input
                    value={customMappingInput}
                    onChange={(e) => setCustomMappingInput(e.target.value)}
                    placeholder="유튜브 Video ID 또는 링크 직접 입력 (예: d9IxDWCfc7A)"
                    leftIcon={<YoutubeIcon size={16} />}
                    rightIcon={
                      customMappingInput && (
                        <button
                          type="button"
                          className="input-clear-btn"
                          onClick={() => setCustomMappingInput('')}
                        >
                          <X size={14} />
                        </button>
                      )
                    }
                  />
                  <Button
                    variant="secondary"
                    size="md"
                    disabled={!customMappingInput.trim() || mappingLoadingId === 'custom'}
                    onClick={handleSaveCustomMapping}
                    leadingIcon={
                      mappingLoadingId === 'custom' ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <Check size={14} />
                      )
                    }
                  >
                    매칭
                  </Button>
                </div>
              )}
            </div>

            {/* ── 음원 불일치 신고 이력 로그 (해당 곡에 신고 이력이 있는 경우에만 표시) ── */}
            {selectedDetail.item.mismatchLogs && selectedDetail.item.mismatchLogs.length > 0 && (
              <div className="detail-mismatch-logs-section">
                <div className="detail-section-header">
                  <div className="detail-section-title">
                    <TriangleAlert size={16} className="text-warning" />
                    <span>불일치 신고 이력 로그</span>
                    <span className="mismatch-log-total-badge">
                      총 {selectedDetail.item.mismatchLogs.reduce((acc, l) => acc + (l.mismatchCount || 1), 0)}회 접수
                    </span>
                  </div>
                </div>

                <div className="detail-mismatch-log-list">
                  {selectedDetail.item.mismatchLogs.map((log, lIdx) => {
                    const logThumb = log.thumbnail || `https://img.youtube.com/vi/${log.youtube_video_id}/hqdefault.jpg`;
                    const timeStr = log.lastReportedAt
                      ? new Date(log.lastReportedAt).toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '';

                    return (
                      <div key={log.youtube_video_id || lIdx} className="mismatch-log-card">
                        <div
                          className="mismatch-log-cover"
                          onClick={() =>
                            setSelectedDetail({
                              type: 'youtube',
                              item: {
                                youtube_video_id: log.youtube_video_id,
                                custom_title: log.custom_title || `${selectedDetail.item.title} - ${selectedDetail.item.artist}`,
                                custom_artist: log.custom_artist || selectedDetail.item.artist,
                              },
                              fromSong: selectedDetail.item,
                            })
                          }
                          title="신고된 영상 상세 보기"
                        >
                          <img src={logThumb} alt="" onError={(e) => { e.target.style.display = 'none'; }} />
                        </div>
                        <div className="mismatch-log-info">
                          <div className="mismatch-log-id-row">
                            <span className="mismatch-log-id code-font">{log.youtube_video_id}</span>
                            <span className="mismatch-log-badge">
                              <AlertTriangle size={11} /> {log.mismatchCount || 1}회 신고
                            </span>
                          </div>
                          {timeStr && (
                            <div className="mismatch-log-time">
                              <Clock size={11} /> 마지막 접수: {timeStr}
                            </div>
                          )}
                        </div>
                        <div className="mismatch-log-actions">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => window.open(`https://www.youtube.com/watch?v=${log.youtube_video_id}`, '_blank')}
                            title="새 탭에서 유튜브 영상 열기"
                            leadingIcon={<ExternalLink size={13} />}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 추천 매칭 유튜브 영상 목록 ── */}
            <div className="detail-recommend-section">
              <div className="detail-section-header">
                <div className="detail-section-title">
                  <YoutubeIcon size={16} className="youtube-icon" />
                  <span>추천 매칭 유튜브 영상</span>
                </div>
                {songYoutubeLoading && <Loader2 size={14} className="animate-spin text-muted" />}
              </div>

              {songYoutubeLoading ? (
                <div className="detail-recommend-loading">
                  <Loader2 size={18} className="animate-spin" />
                  <span>최적의 매칭 후보 영상 검색 중...</span>
                </div>
              ) : songYoutubeCandidates.length > 0 ? (
                <div className="detail-recommend-list">
                  {(() => {
                    const reportedMismatchIds = new Set();
                    if (selectedDetail.item.mismatchLogs && Array.isArray(selectedDetail.item.mismatchLogs)) {
                      selectedDetail.item.mismatchLogs.forEach((l) => {
                        if (l.youtube_video_id) reportedMismatchIds.add(l.youtube_video_id);
                      });
                    }
                    if (selectedDetail.item.isMismatchReport && selectedDetail.item.youtube_video_id) {
                      reportedMismatchIds.add(selectedDetail.item.youtube_video_id);
                    }

                    const autoAltMatch = (!savedMapping && songYoutubeCandidates.length > 0)
                      ? (songYoutubeCandidates.find((c) => !reportedMismatchIds.has(c.youtube_video_id)) || songYoutubeCandidates[0])
                      : null;

                    return songYoutubeCandidates.map((yt, idx) => {
                      const isManualMatched = Boolean(savedMapping && savedMapping.youtube_video_id === yt.youtube_video_id);
                      const isReportedMismatch = Boolean(reportedMismatchIds.has(yt.youtube_video_id));
                      const isCurrentMatched = Boolean(!savedMapping && !isReportedMismatch && autoAltMatch && autoAltMatch.youtube_video_id === yt.youtube_video_id);

                      return (
                        <div
                          key={yt.youtube_video_id || idx}
                          className="yt-result-card draggable-card"
                          draggable="true"
                          onClick={() => setSelectedDetail({ type: 'youtube', item: yt, fromSong: selectedDetail.item })}
                          onDragStart={(e) => {
                            const dragData = {
                              type: 'sofar-track',
                              custom_title: yt.custom_title,
                              custom_artist: yt.custom_artist,
                              youtube_video_id: yt.youtube_video_id,
                              source: 'youtube',
                            };
                            e.dataTransfer.setData('application/json', JSON.stringify(dragData));
                            e.dataTransfer.setData('text/plain', yt.youtube_video_id);
                            e.dataTransfer.effectAllowed = 'copy';
                            setDragGhost(e, {
                              custom_title: yt.custom_title,
                              custom_artist: yt.custom_artist,
                              thumbnail: yt.thumbnail,
                              youtube_video_id: yt.youtube_video_id,
                            });
                          }}
                        >
                          <div className="yt-card-thumbnail">
                            <img
                              src={
                                yt.thumbnail ||
                                `https://img.youtube.com/vi/${yt.youtube_video_id}/hqdefault.jpg`
                              }
                              alt={yt.custom_title}
                            />
                            <div className="yt-card-badges-container">
                              {isManualMatched && (
                                <div className="yt-card-badge-matched">
                                  <Link2 size={13} />
                                  <span>수동 매칭</span>
                                </div>
                              )}
                              {isReportedMismatch && (
                                <div className="yt-card-badge-mismatch">
                                  <AlertTriangle size={12} />
                                  <span>불일치 신고됨</span>
                                </div>
                              )}
                              {isCurrentMatched && (
                                <div className="yt-card-badge-auto">
                                  <Sparkles size={12} />
                                  <span>자동 매칭</span>
                                </div>
                              )}
                            </div>
                            {yt.durationSec > 0 && (
                              <span className="yt-card-duration">
                                {formatDuration(yt.durationSec)}
                              </span>
                            )}

                          <div
                            className="yt-card-actions overlay"
                            draggable="true"
                            onDragStart={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            <Button
                              variant={isManualMatched ? "primary" : "secondary"}
                              size="sm"
                              className={isManualMatched ? "matched-btn" : "matching-btn"}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSongMapping(yt);
                              }}
                              title={isManualMatched ? "기본 매칭 해제" : "이 영상으로 수동 매칭 확정"}
                              leadingIcon={
                                mappingLoadingId === yt.youtube_video_id ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : isManualMatched ? (
                                  <Link2Off size={14} />
                                ) : (
                                  <Link2 size={16} />
                                )
                              }
                            >
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyVideoId(yt.youtube_video_id);
                              }}
                              title="YouTube Video ID 복사"
                              leadingIcon={
                                copiedId === yt.youtube_video_id ? <Check size={14} /> : <Copy size={14} />
                              }
                            />
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`https://www.youtube.com/watch?v=${yt.youtube_video_id}`, '_blank');
                              }}
                              title="새 탭에서 유튜브 영상 열기"
                              leadingIcon={<ExternalLink size={14} />}
                            />
                          </div>
                        </div>

                        <div className="yt-card-info-wrapper">
                          <div className="yt-card-info">
                            <div className="yt-card-title">{yt.custom_title}</div>
                            <div className="yt-card-channel">{yt.custom_artist}</div>
                            {(yt.viewCountText || yt.publishedTimeText) && (
                              <div className="yt-card-meta">
                                {yt.viewCountText && <span className="yt-meta-views">{yt.viewCountText}</span>}
                                {yt.viewCountText && yt.publishedTimeText && <span className="yt-meta-dot">•</span>}
                                {yt.publishedTimeText && <span className="yt-meta-published">{yt.publishedTimeText}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
              ) : (
                <div className="detail-recommend-empty">
                  <span>추천 매칭 영상을 찾을 수 없습니다.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedDetail?.type === 'youtube' && (
          <div className="sidebar-detail-modal">
            <div className="sidebar-detail-media youtube-media">
              <iframe
                src={`https://www.youtube.com/embed/${selectedDetail.item.youtube_video_id}?autoplay=0`}
                title={selectedDetail.item.custom_title}
                className="detail-youtube-iframe"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="sidebar-detail-info">
              <h3 className="detail-title">{selectedDetail.item.custom_title}</h3>
              <p className="detail-subtitle">{selectedDetail.item.custom_artist}</p>

              <div className="detail-meta-group">
                {selectedDetail.item.viewCountText && (
                  <div className="detail-meta-row">
                    <span className="meta-label">조회수</span>
                    <span className="meta-value">{selectedDetail.item.viewCountText}</span>
                  </div>
                )}
                {selectedDetail.item.publishedTimeText && (
                  <div className="detail-meta-row">
                    <span className="meta-label">게시일</span>
                    <span className="meta-value">{selectedDetail.item.publishedTimeText}</span>
                  </div>
                )}
                {selectedDetail.item.durationSec > 0 && (
                  <div className="detail-meta-row">
                    <span className="meta-label">영상 길이</span>
                    <span className="meta-value">{formatDuration(selectedDetail.item.durationSec)}</span>
                  </div>
                )}
                <div className="detail-meta-row">
                  <span className="meta-label">YouTube Video ID</span>
                  <span className="meta-value code-font">{selectedDetail.item.youtube_video_id}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </aside>
  );
}
