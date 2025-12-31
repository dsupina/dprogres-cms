import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';

// Import existing pages
import HomePage from './pages/HomePage';
import BlogPage from './pages/BlogPage';
import PostPage from './pages/PostPage';
import CategoryPage from './pages/CategoryPage';
import PageView from './pages/PageView';
import LoginPage from './pages/admin/LoginPage';
import DashboardPage from './pages/admin/DashboardPage';

// Import new admin pages
import PostsPage from './pages/admin/PostsPage';
import CategoriesPage from './pages/admin/CategoriesPage';
import PostNewPage from './pages/admin/PostNewPage';
import PostEditPage from './pages/admin/PostEditPage';
import PagesPage from './pages/admin/PagesPage';
import PageNewPage from './pages/admin/PageNewPage';
import PageEditPage from './pages/admin/PageEditPage';
import MediaPage from './pages/admin/MediaPage';
import SettingsPage from './pages/admin/SettingsPage';
import TemplatesPage from './pages/admin/TemplatesPage';
import TemplateNewPage from './pages/admin/TemplateNewPage';
import TemplateEditPage from './pages/admin/TemplateEditPage';
import DomainsPage from './pages/admin/DomainsPage';
import MenusPage from './pages/admin/MenusPage';
import SitesPage from './pages/admin/SitesPage';
import DistributionQueuePage from './pages/admin/DistributionQueuePage';
import BillingPage from './pages/admin/BillingPage';
import BillingSuccessPage from './pages/admin/BillingSuccessPage';
import OrganizationSettingsPage from './pages/admin/OrganizationSettingsPage';

// Super Admin pages
import SuperAdminDashboardPage from './pages/admin/SuperAdminDashboardPage';
import SuperAdminOrganizationsPage from './pages/admin/SuperAdminOrganizationsPage';
import SuperAdminUsersPage from './pages/admin/SuperAdminUsersPage';

// Import existing components
import PublicLayout from './components/layout/PublicLayout';
import AdminLayout from './components/layout/AdminLayout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import SuperAdminRoute from './components/auth/SuperAdminRoute';

// Import auth store
import { useAuthStore } from './lib/auth';

function App() {
  const { checkAuth } = useAuthStore();

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

      {/* Admin Login Route */}
      <Route path="/admin/login" element={<LoginPage />} />

      {/* Protected Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="posts" element={<PostsPage />} />
        <Route path="posts/new" element={<PostNewPage />} />
        <Route path="posts/:id/edit" element={<PostEditPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="pages" element={<PagesPage />} />
        <Route path="pages/new" element={<PageNewPage />} />
        <Route path="pages/:id/edit" element={<PageEditPage />} />
        <Route path="media" element={<MediaPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="templates/new" element={<TemplateNewPage />} />
        <Route path="templates/:id/edit" element={<TemplateEditPage />} />
        <Route path="domains" element={<DomainsPage />} />
        <Route path="sites" element={<SitesPage />} />
        <Route path="sites/:id/menus" element={<MenusPage />} />
        <Route path="menus" element={<MenusPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="distribution-queue" element={<DistributionQueuePage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="billing/success" element={<BillingSuccessPage />} />
        <Route path="organization" element={<OrganizationSettingsPage />} />

        {/* Super Admin Routes - Protected by SuperAdminRoute */}
        <Route path="super-admin" element={<SuperAdminRoute><SuperAdminDashboardPage /></SuperAdminRoute>} />
        <Route path="super-admin/organizations" element={<SuperAdminRoute><SuperAdminOrganizationsPage /></SuperAdminRoute>} />
        <Route path="super-admin/users" element={<SuperAdminRoute><SuperAdminUsersPage /></SuperAdminRoute>} />
      </Route>

      {/* 404 Route */}
      <Route path="*" element={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-900">404</h1>
            <p className="text-gray-600 mt-2">Page not found</p>
          </div>
        </div>
      } />
    </Routes>
  );
}

export default App; 