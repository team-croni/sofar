import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import CurationsPage from './pages/CurationsPage';
import SearchRankingPage from './pages/SearchRankingPage';
import UsersPage from './pages/UsersPage';
import AdminPlaylistEditor from './pages/AdminPlaylistEditor';
import { AdminProvider } from './context/AdminContext';
import { ToastProvider } from './context/ToastContext';
import AdminToastContainer from './components/AdminToastContainer';

export default function App() {
  return (
    <ToastProvider>
      <AdminProvider>
        <AdminToastContainer />
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/curations" element={<CurationsPage />} />
          <Route path="/search-ranking" element={<SearchRankingPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/playlist/new" element={<AdminPlaylistEditor />} />
          <Route path="/playlist/:id" element={<AdminPlaylistEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AdminProvider>
    </ToastProvider>
  );
}

