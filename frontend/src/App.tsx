import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuthStore } from '@/lib/auth';

// Public pages
import HomePage from '@/pages/HomePage';
import BlogPage from '@/pages/BlogPage';
import PostPage from '@/pages/PostPage';
import CategoryPage from '@/pages/CategoryPage';
import PageView from '@/pages/PageView';
import NotFoundPage from '@/pages/NotFoundPage';

// Admin pages
import AdminLayout from '@/components/admin/AdminLayout';
import LoginPage from '@/pages/admin/LoginPage';
import AdminDashboard from '@/pages/admin/AdminDashboard';
import PostsManagement from '@/pages/admin/PostsManagement';
import CreatePost from '@/pages/admin/CreatePost';
import EditPost from '@/pages/admin/EditPost';
import CategoriesManagement from '@/pages/admin/CategoriesManagement';
import PagesManagement from '@/pages/admin/PagesManagement';
import CreatePage from '@/pages/admin/CreatePage';
import EditPage from '@/pages/admin/EditPage';
import MediaManagement from '@/pages/admin/MediaManagement';
import ProfilePage from '@/pages/admin/ProfilePage';

// Components
import PublicLayout from '@/components/layout/PublicLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function App() {
  const { checkAuth, isAuthenticated } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="blog" element={<BlogPage />} />
        <Route path="blog/:slug" element={<PostPage />} />
        <Route path="category/:slug" element={<CategoryPage />} />
        <Route path="page/:slug" element={<PageView />} />
      </Route>

      {/* Admin Routes */}
      <Route path="/admin/login" element={<LoginPage />} />
      
      <Route path="/admin" element={
        <ProtectedRoute>
          <AdminLayout />
        </ProtectedRoute>
      }>
        <Route index element={<AdminDashboard />} />
        
        {/* Posts Management */}
        <Route path="posts" element={<PostsManagement />} />
        <Route path="posts/new" element={<CreatePost />} />
        <Route path="posts/:id/edit" element={<EditPost />} />
        
        {/* Categories Management */}
        <Route path="categories" element={<CategoriesManagement />} />
        
        {/* Pages Management */}
        <Route path="pages" element={<PagesManagement />} />
        <Route path="pages/new" element={<CreatePage />} />
        <Route path="pages/:id/edit" element={<EditPage />} />
        
        {/* Media Management */}
        <Route path="media" element={<MediaManagement />} />
        
        {/* Profile */}
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      {/* 404 Page */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App; 