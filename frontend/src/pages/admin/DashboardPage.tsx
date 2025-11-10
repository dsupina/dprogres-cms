import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FileText,
  Folder,
  Eye,
  Calendar,
  Plus,
  ArrowRight,
  Share2,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { adminService } from '../../services/admin';
import { formatDate, formatRelativeTime } from '../../lib/utils';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { useDistributionMetrics } from '../../hooks/useMetrics';

export default function DashboardPage() {
  // Fetch dashboard stats from backend
  const { data: dashboard, isLoading } = useQuery({ queryKey: ['admin-dashboard'], queryFn: () => adminService.getDashboard() });
  const { data: distributionMetrics, isLoading: isDistributionLoading } = useDistributionMetrics();

  // Calculate stats
  const stats = {
    totalPosts: dashboard?.totalPosts || 0,
    publishedPosts: dashboard?.postsByStatus?.published || 0,
    draftPosts: dashboard?.postsByStatus?.draft || 0,
    totalCategories: dashboard?.totalCategories || 0,
    totalPages: dashboard?.totalPages || 0,
    recentPosts: dashboard?.recentPosts || [],
  };

  const distribution = distributionMetrics ?? {
    channelPerformance: [],
    upcomingSchedules: [],
    recentDeliveries: [],
    alerts: [],
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
              {stats.recentPosts.length === 0 ? (
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-primary-600" />
                <h2 className="text-lg font-medium text-gray-900">Distribution performance</h2>
              </div>
              <Button as={Link} to="/admin/distribution-queue" size="sm" variant="outline">
                View queue
              </Button>
            </div>
            {isDistributionLoading ? (
              <div className="p-6 flex justify-center"><LoadingSpinner /></div>
            ) : (
              <div className="p-6 space-y-6">
                {distribution.channelPerformance.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Connect publishing targets to start tracking multi-channel distribution analytics.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {distribution.channelPerformance.map((metric) => (
                      <div key={metric.channel} className="border border-gray-200 rounded-lg p-4">
                        <p className="text-sm font-semibold text-gray-900 capitalize">{metric.channel}</p>
                        <div className="mt-3 space-y-2 text-xs text-gray-600">
                          <div className="flex items-center justify-between">
                            <span>Sent</span>
                            <span className="text-green-600 font-medium">{metric.sent}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Queued</span>
                            <span className="text-yellow-600 font-medium">{metric.queued}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Retrying</span>
                            <span className="text-blue-600 font-medium">{metric.retrying}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Failed</span>
                            <span className="text-red-600 font-medium">{metric.failed}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Recent deliveries</h3>
                  {distribution.recentDeliveries.length === 0 ? (
                    <p className="text-sm text-gray-500">No delivery activity recorded yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {distribution.recentDeliveries.slice(0, 5).map((log) => (
                        <div key={log.id} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{log.post_title}</p>
                              <p className="text-xs text-gray-500">{log.target_name} · {formatRelativeTime(log.created_at)}</p>
                            </div>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                log.status === 'sent'
                                  ? 'bg-green-100 text-green-800'
                                  : log.status === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : log.status === 'retrying'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {log.status}
                            </span>
                          </div>
                          {log.error && <p className="text-xs text-red-600 mt-2">{log.error}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <h2 className="text-lg font-medium text-gray-900">Alerts & retries</h2>
            </div>
            <div className="p-6 space-y-4">
              {isDistributionLoading ? (
                <div className="flex justify-center"><LoadingSpinner size="sm" /></div>
              ) : distribution.alerts.length === 0 ? (
                <p className="text-sm text-gray-500">No delivery alerts. Everything looks good!</p>
              ) : (
                distribution.alerts.slice(0, 5).map((alert) => (
                  <div key={alert.id} className="border border-red-100 rounded-lg p-3 bg-red-50">
                    <p className="text-sm font-medium text-red-700">{alert.post_title}</p>
                    <p className="text-xs text-red-600">{alert.target_name} · {formatRelativeTime(alert.updated_at)}</p>
                    {alert.error && <p className="text-xs text-red-700 mt-2">{alert.error}</p>}
                    <Link to="/admin/distribution-queue" className="text-xs text-red-700 font-medium mt-2 inline-flex">
                      Investigate →
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary-600" />
              <h2 className="text-lg font-medium text-gray-900">Upcoming sends</h2>
            </div>
            <div className="p-6 space-y-4">
              {isDistributionLoading ? (
                <div className="flex justify-center"><LoadingSpinner size="sm" /></div>
              ) : distribution.upcomingSchedules.length === 0 ? (
                <p className="text-sm text-gray-500">No upcoming deliveries scheduled.</p>
              ) : (
                distribution.upcomingSchedules.slice(0, 5).map((schedule) => (
                  <div key={schedule.id} className="border border-gray-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-900">{schedule.post_title}</p>
                    <p className="text-xs text-gray-500">{schedule.target_name} · {formatDate(schedule.scheduled_for, 'MMM d, h:mm a')}</p>
                    <p className="text-xs text-gray-500">{formatRelativeTime(schedule.scheduled_for)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}