import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2,
  Users,
  FileText,
  Image,
  DollarSign,
  TrendingUp,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { getDashboardMetrics } from '../../services/superAdmin';

export default function SuperAdminDashboardPage() {
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['super-admin-metrics'],
    queryFn: getDashboardMetrics,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Failed to load dashboard metrics</p>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Organizations',
      value: metrics?.organizations.total || 0,
      subtext: `${metrics?.organizations.newLast30Days || 0} new this month`,
      icon: Building2,
      color: 'bg-blue-500',
      link: '/admin/super-admin/organizations',
    },
    {
      title: 'Total Users',
      value: metrics?.users.total || 0,
      subtext: `${metrics?.users.superAdmins || 0} super admins`,
      icon: Users,
      color: 'bg-green-500',
      link: '/admin/super-admin/users',
    },
    {
      title: 'Total Posts',
      value: metrics?.content.totalPosts || 0,
      subtext: `${metrics?.content.totalPages || 0} pages`,
      icon: FileText,
      color: 'bg-purple-500',
    },
    {
      title: 'Media Files',
      value: metrics?.content.totalMedia || 0,
      subtext: 'Across all orgs',
      icon: Image,
      color: 'bg-orange-500',
    },
    {
      title: 'Active Subscriptions',
      value: metrics?.revenue.activeSubscriptions || 0,
      subtext: 'Paying customers',
      icon: TrendingUp,
      color: 'bg-indigo-500',
    },
    {
      title: 'MRR',
      value: `$${metrics?.revenue.mrr || 0}`,
      subtext: 'Monthly recurring revenue',
      icon: DollarSign,
      color: 'bg-emerald-500',
    },
  ];

  const planTiers = metrics?.organizations.byPlanTier || {};
  const totalOrgs = metrics?.organizations.total || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <Shield className="h-6 w-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
          <p className="text-gray-600">Platform-wide metrics and management</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <div
            key={stat.title}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.title}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
                <p className="text-sm text-gray-500 mt-1">{stat.subtext}</p>
              </div>
              <div className={`p-3 rounded-lg ${stat.color}`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
            {stat.link && (
              <Link
                to={stat.link}
                className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 mt-4"
              >
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Plan Distribution */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Organizations by Plan
        </h2>
        <div className="space-y-3">
          {Object.entries(planTiers).map(([tier, count]) => {
            const percentage = Math.round((count / totalOrgs) * 100);
            const tierColors: Record<string, string> = {
              free: 'bg-gray-400',
              starter: 'bg-blue-500',
              pro: 'bg-indigo-500',
              enterprise: 'bg-purple-500',
            };
            return (
              <div key={tier}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {tier}
                  </span>
                  <span className="text-sm text-gray-500">
                    {count} ({percentage}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${tierColors[tier] || 'bg-gray-500'}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            to="/admin/super-admin/organizations"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Building2 className="h-5 w-5 text-gray-500" />
            <div>
              <p className="font-medium text-gray-900">Manage Organizations</p>
              <p className="text-sm text-gray-500">View and manage all organizations</p>
            </div>
          </Link>
          <Link
            to="/admin/super-admin/users"
            className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Users className="h-5 w-5 text-gray-500" />
            <div>
              <p className="font-medium text-gray-900">Manage Users</p>
              <p className="text-sm text-gray-500">View all users and manage super admins</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
