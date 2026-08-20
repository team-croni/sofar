/**
 * @sofar/types - Shared TypeScript definitions across sofar monorepo
 */

export interface Track {
  id: string;
  playlist_id?: string;
  youtube_video_id: string;
  custom_title: string;
  custom_artist: string;
  artwork?: string | null;
  durationSec?: number;
  lyric_offset?: number;
  custom_lyrics?: string | null;
  sequence?: number;
  created_at?: string;
}

export interface Playlist {
  id: string;
  user_id?: string;
  title: string;
  description?: string;
  cover?: string;
  category?: 'theme' | 'genre' | 'situation';
  categoryLabel?: string;
  is_public?: boolean;
  track_count?: number;
  tracks?: Track[];
  created_at?: string;
  updated_at?: string;
}

export interface ChartTrack {
  id: string;
  rank: number;
  custom_title: string;
  custom_artist: string;
  artwork: string | null;
  youtube_video_id?: string;
  durationSec?: number;
  album?: string;
  searchQuery: string;
  playCount?: number;
  sofarPlayCount?: number;
  changeType?: 'up' | 'down' | 'same' | 'new';
  changeVal?: number | null;
  source: 'bugs-live-crawler' | 'lastfm-discovery' | 'local-curation';
  genre?: string;
  releaseYear?: number;
}

export interface CategoryPlaylist {
  id: string;
  category: 'genre' | 'theme' | 'situation';
  categoryLabel: string;
  title: string;
  subtitle: string;
  cover: string;
  tag: string;
  author: string;
  trackCount: number;
  tracks: ChartTrack[];
}

export interface UserProfile {
  id: string;
  email: string;
  username?: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
  status?: 'active' | 'suspended';
  provider?: 'google' | 'email';
}

export interface MismatchLogItem {
  youtube_video_id: string;
  mismatchCount: number;
  lastReportedAt: number;
  thumbnail?: string;
  custom_title?: string;
  custom_artist?: string;
}

export interface MismatchReport {
  id: string;
  searchQuery: string;
  custom_title: string;
  custom_artist: string;
  youtube_video_id: string;
  mismatchCount: number;
  lastReportedAt: number;
  artwork?: string;
  thumbnail?: string;
  logs: MismatchLogItem[];
  status?: 'pending' | 'resolved';
  resolvedAt?: number;
}
