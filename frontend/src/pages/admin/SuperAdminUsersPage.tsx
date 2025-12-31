import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Users,
  Shield,
  ShieldOff,
  Search,
  Mail,
  Building2,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Filter,
} from 'lucide-react';
import { formatDate } from '../../lib/utils';
import { useAuthStore } from '../../lib/auth';
import { getAllUsers, toggleSuperAdminStatus, UserSummary } from '../../services/superAdmin';

type SortField = 'name' | 'email' | 'org_count' | 'created_at';
type SortOrder = 'asc' | 'desc';
type StatusFilter = 'all' | 'super_admin' | 'verified' | 'unverified';

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50];

export default function SuperAdminUsersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const { user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();

  // Pagination & sorting state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['super-admin-users'],
    queryFn: getAllUsers,
  });

  const toggleSuperAdminMutation = useMutation({
    mutationFn: ({ userId, isSuperAdmin }: { userId: number; isSuperAdmin: boolean }) =>
      toggleSuperAdminStatus(userId, isSuperAdmin),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-users'] });
      toast.success(
        variables.isSuperAdmin
          ? 'User promoted to super admin'
          : 'Super admin status removed'
      );
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update user');
    },
  });

  // Filter, sort, and paginate users
  const processedUsers = useMemo(() => {
    if (!users) return { paginatedUsers: [], totalCount: 0, totalPages: 0 };

    // Filter by search
    let filtered = users.filter(
      (user) =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        `${user.first_name} ${user.last_name}`
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
    );

    // Filter by status
    if (statusFilter === 'super_admin') {
      filtered = filtered.filter((user) => user.is_super_admin);
    } else if (statusFilter === 'verified') {
      filtered = filtered.filter((user) => user.email_verified);
    } else if (statusFilter === 'unverified') {
      filtered = filtered.filter((user) => !user.email_verified);
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = `${a.first_name} ${a.last_name}`.localeCompare(
            `${b.first_name} ${b.last_name}`
          );
          break;
        case 'email':
          comparison = a.email.localeCompare(b.email);
          break;
        case 'org_count':
          comparison = a.organizations.length - b.organizations.length;
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Paginate
    const totalCount = sorted.length;
    const totalPages = Math.ceil(totalCount / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedUsers = sorted.slice(startIndex, startIndex + itemsPerPage);

    return { paginatedUsers, totalCount, totalPages };
  }, [users, searchQuery, statusFilter, sortField, sortOrder, currentPage, itemsPerPage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  const handleToggleSuperAdmin = (user: UserSummary) => {
    if (user.id === currentUser?.id) {
      toast.error('You cannot modify your own super admin status');
      return;
    }
    toggleSuperAdminMutation.mutate({
      userId: user.id,
      isSuperAdmin: !user.is_super_admin,
    });
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown
      className={`h-4 w-4 ml-1 inline-block ${
        sortField === field ? 'text-indigo-600' : 'text-gray-400'
      }`}
    />
  );

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
        <p className="text-red-800">Failed to load users</p>
      </div>
    );
  }

  const { paginatedUsers, totalCount, totalPages } = processedUsers;
  const startIndex = (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, totalCount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <Users className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Users</h1>
            <p className="text-gray-600">
              {users?.length || 0} users on the platform
            </p>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setCurrentPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Users</option>
            <option value="super_admin">Super Admins</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
          <span className="text-sm text-gray-500">Show</span>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="border border-gray-300 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {ITEMS_PER_PAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-500">per page</span>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('name')}
              >
                User <SortIcon field="name" />
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('email')}
              >
                Email <SortIcon field="email" />
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('org_count')}
              >
                Organizations <SortIcon field="org_count" />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('created_at')}
              >
                Joined <SortIcon field="created_at" />
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginatedUsers.map((user: UserSummary) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-gray-600 font-medium">
                        {user.first_name?.[0] || user.email[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">
                        {user.first_name} {user.last_name}
                      </p>
                      {user.is_super_admin && (
                        <Shield className="h-4 w-4 text-indigo-600" />
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Mail className="h-3 w-3" />
                    {user.email}
                  </div>
                </td>
                <td className="px-6 py-4">
                  {user.organizations.length > 0 ? (
                    <div className="space-y-1">
                      {user.organizations.slice(0, 2).map((org) => (
                        <div
                          key={org.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Building2 className="h-3 w-3 text-gray-400" />
                          <span className="text-gray-700 truncate max-w-[150px]">{org.name}</span>
                          <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                            {org.role}
                          </span>
                        </div>
                      ))}
                      {user.organizations.length > 2 && (
                        <span className="text-xs text-gray-500">
                          +{user.organizations.length - 2} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">No organizations</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col gap-1">
                    {user.is_super_admin && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-800 rounded-full w-fit">
                        <Shield className="h-3 w-3" />
                        Super Admin
                      </span>
                    )}
                    {user.email_verified ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="h-3 w-3" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-yellow-600">
                        <XCircle className="h-3 w-3" />
                        Unverified
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {formatDate(user.created_at, 'MMM d, yyyy')}
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => handleToggleSuperAdmin(user)}
                    disabled={
                      toggleSuperAdminMutation.isPending ||
                      user.id === currentUser?.id
                    }
                    className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      user.is_super_admin
                        ? 'text-red-700 bg-red-50 hover:bg-red-100'
                        : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={
                      user.id === currentUser?.id
                        ? 'Cannot modify your own status'
                        : user.is_super_admin
                        ? 'Remove super admin'
                        : 'Make super admin'
                    }
                  >
                    {user.is_super_admin ? (
                      <>
                        <ShieldOff className="h-4 w-4" />
                        Remove
                      </>
                    ) : (
                      <>
                        <Shield className="h-4 w-4" />
                        Promote
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {paginatedUsers.length === 0 && (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No users found</p>
          </div>
        )}

        {/* Pagination */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-600">
              Showing {startIndex} to {endIndex} of {totalCount} users
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 rounded-lg text-sm ${
                      currentPage === pageNum
                        ? 'bg-indigo-600 text-white'
                        : 'border border-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
