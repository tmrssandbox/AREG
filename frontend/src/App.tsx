import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute  from './components/ProtectedRoute';
import LoginPage       from './pages/LoginPage';
import DashboardPage   from './pages/DashboardPage';
import CatalogPage     from './pages/CatalogPage';
import ArchivePage     from './pages/ArchivePage';
import ImportPage      from './pages/ImportPage';
import UsersPage       from './pages/UsersPage';
import ProfilePage     from './pages/ProfilePage';
import HelpPage        from './pages/HelpPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <ProtectedRoute><DashboardPage /></ProtectedRoute>
          } />
          <Route path="/catalog" element={
            <ProtectedRoute><CatalogPage /></ProtectedRoute>
          } />
          <Route path="/archive" element={
            <ProtectedRoute adminOnly><ArchivePage /></ProtectedRoute>
          } />
          <Route path="/import" element={
            <ProtectedRoute adminOnly><ImportPage /></ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute adminOnly><UsersPage /></ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute><ProfilePage /></ProtectedRoute>
          } />
          <Route path="/help" element={
            <ProtectedRoute><HelpPage /></ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
