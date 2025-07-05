import { useQuery } from 'react-query';
import { Link } from 'react-router-dom';
import { 
  FileText, 
  Folder, 
  Users, 
  Eye, 
  TrendingUp, 
  Calendar,
  Plus,
  ArrowRight,
  BarChart3
} from 'lucide-react';
import { postsService } from '@/services/posts';
import { categoriesService } from '@/services/categories';
import { pagesService } from '@/services/pages';
import { formatDate } from '@/lib/utils';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface DashboardStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  totalCategories: number;
  totalPages: number;
  recentPosts: any[];
}

export default function DashboardPage() {
  // Fetch dashboard data
  const { data: postsData, isLoading: postsLoading } = useQuery(
    'admin-posts',
    () => postsService.getAllPosts({ limit: 5 })
  );

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery(
    'admin-categories',
    () => categoriesService.getAllCategories()
  );

  const { data: pagesData, isLoading: pagesLoading } = useQuery(
    'admin-pages',
    () => pagesService.getAllPages()
  );

  const { data: recentPostsData, isLoading: recentPostsLoading } = useQuery(
    'admin-recent-posts',
    () => postsService.getAllPosts({ limit: 10, sort: 'created_at', order: 'desc' })
  );

  const isLoading = postsLoading || categoriesLoading || pagesLoading;

  // Calculate stats
  const stats = {
    totalPosts: postsData?.total || 0,
    publishedPosts: postsData?.posts?.filter(p => p.status === 'published').length || 0,
    draftPosts: postsData?.posts?.filter(p => p.status === 'draft').length || 0,
    totalCategories: categoriesData?.total || 0,
    totalPages: pagesData?.total || 0,
    recentPosts: recentPostsData?.posts || []
  };

  const statCards = [
    {
      title: 'Total Posts',
      value: stats.totalPosts,
      icon: FileText,
      color: 'bg-blue-500',
      href: '/admin/posts'
    },
    {
      title: 'Published Posts',
      value: stats.publishedPosts,
      icon: Eye,
      color: 'bg-green-500',
      href: '/admin/posts?status=published'
    },
    {
      title: 'Draft Posts',
      value: stats.draftPosts,
      icon: FileText,
      color: 'bg-yellow-500',
      href: '/admin/posts?status=draft'
    },
    {
      title: 'Categories',
      value: stats.totalCategories,
      icon: Folder,
      color: 'bg-purple-500',
      href: '/admin/categories'
    },
    {
      title: 'Pages',
      value: stats.totalPages,
      icon: FileText,
      color: 'bg-indigo-500',
      href: '/admin/pages'
    }
  ];

  const quickActions = [
    {
      title: 'Create New Post',
      description: 'Write a new blog post',
      icon: FileText,
      href: '/admin/posts/new',
      color: 'bg-primary-600'
    },
    {
      title: 'Add Category',
      description: 'Create a new category',
      icon: Folder,
      href: '/admin/categories/new',
      color: 'bg-green-600'
    },
    {
      title: 'Create Page',
      description: 'Add a new static page',
      icon: FileText,
      href: '/admin/pages/new',
      color: 'bg-blue-600'
    },
    {
      title: 'View Site',
      description: 'Preview your website',
      icon: Eye,
      href: '/',
      color: 'bg-gray-600',
      external: true
    }
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back! Here's what's happening with your site.</p>
        </div>
        <div className="flex space-x-3">
          <Button as={Link} to="/admin/posts/new" className="bg-primary-600 hover:bg-primary-700">
            <Plus className="mr-2 h-4 w-4" />
            New Post
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link
              key={stat.title}
              to={stat.href}
              className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center">
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Posts */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900">Recent Posts</h2>
                <Link
                  to="/admin/posts"
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  View all
                </Link>
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {recentPostsLoading ? (
                <div className="p-6 text-center">
                  <LoadingSpinner size="sm" />
                </div>
              ) : stats.recentPosts.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No posts yet. Create your first post!
                </div>
              ) : (
                stats.recentPosts.slice(0, 5).map((post) => (
                  <div key={post.id} className="p-6 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-gray-900">
                          <Link
                            to={`/admin/posts/${post.id}/edit`}
                            className="hover:text-primary-600"
                          >
                            {post.title}
                          </Link>
                        </h3>
                        <div className="mt-1 flex items-center text-sm text-gray-500">
                          <Calendar className="h-4 w-4 mr-1" />
                          {formatDate(post.created_at, 'MMM d, yyyy')}
                          <span className="mx-2">•</span>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            post.status === 'published' 
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {post.status}
                          </span>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Quick Actions</h2>
            </div>
            <div className="p-6 space-y-4">
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.title}
                    to={action.href}
                    target={action.external ? '_blank' : undefined}
                    className="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className={`${action.color} p-2 rounded-lg`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">{action.title}</p>
                      <p className="text-xs text-gray-500">{action.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Site Stats */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Site Overview</h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Content Status</span>
                  <div className="flex space-x-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {stats.publishedPosts} Published
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      {stats.draftPosts} Drafts
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Total Categories</span>
                  <span className="text-sm font-medium text-gray-900">{stats.totalCategories}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Static Pages</span>
                  <span className="text-sm font-medium text-gray-900">{stats.totalPages}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 