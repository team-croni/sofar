import { PlaylistEditorProvider } from '../components/playlist-editor/PlaylistEditorContext';
import PlaylistEditorContent from '../components/playlist-editor/PlaylistEditorContent';

export default function AdminPlaylistEditor() {
  return (
    <PlaylistEditorProvider>
      <PlaylistEditorContent />
    </PlaylistEditorProvider>
  );
}
