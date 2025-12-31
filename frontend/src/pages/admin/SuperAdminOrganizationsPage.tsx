import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Building2,
  Users,
  Search,
  FileText,
  Globe,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Filter,
  MoreVertical,
  Ban,
  CheckCircle,
  Trash2,
  AlertTriangle,
  XCircle,
  UserPlus,
} from 'lucide-react';
import { formatDate } from '../../lib/utils';
import {
  getAllOrganizations,
  getOrganizationDetails,
  createOrgAdmin,
  suspendOrganization,
  unsuspendOrganization,
  initiateOrganizationDeletion,
  confirmOrganizationDeletion,
  cancelOrganizationDeletion,
  OrganizationSummary,
  CreateOrgAdminData,
} from '../../services/superAdmin';

type SortField = 'name' | 'plan_tier' | 'member_count' | 'created_at' | 'status';
type SortOrder = 'asc' | 'desc';

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50];

export default function SuperAdminOrganizationsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrgId, setExpandedOrgId] = useState<number | null>(null);
  const [showAddAdminModal, setShowAddAdminModal] = useState<number | null>(null);
  const [newAdminData, setNewAdminData] = useState<CreateOrgAdminData>({
    email: '',
    firstName: '',
    lastName: '',
  });

  // Pagination & sorting state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Action modals state
  const [suspendModal, setSuspendModal] = useState<{ org: OrganizationSummary; step: number } | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ org: OrganizationSummary; step: number; confirmationWord?: string } | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [actionMenuOrg, setActionMenuOrg] = useState<number | null>(null);

  const queryClient = useQueryClient();

  const { data: organizations, isLoading, error } = useQuery({
    queryKey: ['super-admin-organizations'],
    queryFn: getAllOrganizations,
  });

  const { data: orgDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['super-admin-org-details', expandedOrgId],
    queryFn: () => (expandedOrgId ? getOrganizationDetails(expandedOrgId) : null),
    enabled: !!expandedOrgId,
  });

  const createAdminMutation = useMutation({
    mutationFn: ({ orgId, data }: { orgId: number; data: CreateOrgAdminData }) =>
      createOrgAdmin(orgId, data),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      if (expandedOrgId) {
        queryClient.invalidateQueries({ queryKey: ['super-admin-org-details', expandedOrgId] });
      }
      if (result.temporaryPassword) {
        toast.success(`Admin created! Temporary password: ${result.temporaryPassword}`, { duration: 10000 });
      } else {
        toast.success('User added as admin to organization');
      }
      setShowAddAdminModal(null);
      setNewAdminData({ email: '', firstName: '', lastName: '' });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create admin');
    },
  });

  const suspendMutation = useMutation({
    mutationFn: ({ orgId, reason }: { orgId: number; reason: string }) =>
      suspendOrganization(orgId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      toast.success('Organization suspended');
      setSuspendModal(null);
      setSuspendReason('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to suspend organization');
    },
  });

  const unsuspendMutation = useMutation({
    mutationFn: (orgId: number) => unsuspendOrganization(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      toast.success('Organization reactivated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to reactivate organization');
    },
  });

  const initiateDeletionMutation = useMutation({
    mutationFn: (orgId: number) => initiateOrganizationDeletion(orgId),
    onSuccess: (result, orgId) => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      const org = organizations?.find(o => o.id === orgId);
      if (org) {
        setDeleteModal({ org, step: 2, confirmationWord: result.confirmationWord });
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to initiate deletion');
    },
  });

  const confirmDeletionMutation = useMutation({
    mutationFn: ({ orgId, confirmationWord }: { orgId: number; confirmationWord: string }) =>
      confirmOrganizationDeletion(orgId, confirmationWord),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      toast.success('Organization permanently deleted');
      setDeleteModal(null);
      setDeleteConfirmInput('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Invalid confirmation word');
    },
  });

  const cancelDeletionMutation = useMutation({
    mutationFn: (orgId: number) => cancelOrganizationDeletion(orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      toast.success('Deletion cancelled, organization reactivated');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to cancel deletion');
    },
  });

  // Filter, sort, and paginate organizations
  const processedOrganizations = useMemo(() => {
    if (!organizations) return { paginatedOrgs: [], totalCount: 0, totalPages: 0 };

    let filtered = organizations.filter(
      (org) =>
        org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.owner_email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (planFilter !== 'all') {
      filtered = filtered.filter((org) => org.plan_tier === planFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((org) => org.status === statusFilter);
    }

    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'plan_tier':
          comparison = a.plan_tier.localeCompare(b.plan_tier);
          break;
        case 'member_count':
          comparison = a.member_count - b.member_count;
          break;
        case 'status':
          comparison = (a.status || 'active').localeCompare(b.status || 'active');
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const totalCount = sorted.length;
    const totalPages = Math.ceil(totalCount / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedOrgs = sorted.slice(startIndex, startIndex + itemsPerPage);

    return { paginatedOrgs, totalCount, totalPages };
  }, [organizations, searchQuery, planFilter, statusFilter, sortField, sortOrder, currentPage, itemsPerPage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <ArrowUpDown
      className={`h-4 w-4 ml-1 inline-block ${
        sortField === field ? 'text-indigo-600' : 'text-gray-400'
      }`}
    />
  );

  const getStatusBadge = (org: OrganizationSummary) => {
    switch (org.status) {
      case 'suspended':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
            <Ban className="h-3 w-3" />
            Suspended
          </span>
        );
      case 'pending_deletion':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded-full">
            <AlertTriangle className="h-3 w-3" />
            Pending Deletion
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
            <CheckCircle className="h-3 w-3" />
            Active
          </span>
        );
    }
  };

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
        <p className="text-red-800">Failed to load organizations</p>
      </div>
    );
  }

  const { paginatedOrgs, totalCount, totalPages } = processedOrganizations;
  const startIndex = (currentPage - 1) * itemsPerPage + 1;
  const endIndex = Math.min(currentPage * itemsPerPage, totalCount);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
            <p className="text-gray-600">
              {organizations?.length || 0} organizations on the platform
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
            placeholder="Search by name or owner..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-5 w-5 text-gray-400" />
          <select
            value={planFilter}
            onChange={(e) => {
              setPlanFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Plans</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="pending_deletion">Pending Deletion</option>
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

      {/* Organizations Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('name')}
              >
                Organization <SortIcon field="name" />
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('plan_tier')}
              >
                Plan <SortIcon field="plan_tier" />
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('member_count')}
              >
                Members <SortIcon field="member_count" />
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('status')}
              >
                Status <SortIcon field="status" />
              </th>
              <th
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                onClick={() => handleSort('created_at')}
              >
                Created <SortIcon field="created_at" />
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginatedOrgs.map((org) => (
              <React.Fragment key={org.id}>
                <tr
                  className={`hover:bg-gray-50 cursor-pointer ${
                    expandedOrgId === org.id ? 'bg-gray-50' : ''
                  }`}
                  onClick={() => setExpandedOrgId(expandedOrgId === org.id ? null : org.id)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-gray-500" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{org.name}</p>
                        <p className="text-sm text-gray-500">{org.owner_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      org.plan_tier === 'enterprise' ? 'bg-purple-100 text-purple-800' :
                      org.plan_tier === 'pro' ? 'bg-indigo-100 text-indigo-800' :
                      org.plan_tier === 'starter' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {org.plan_tier}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Users className="h-4 w-4" />
                      {org.member_count}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(org)}
                    {org.suspended_reason && org.status !== 'active' && (
                      <p className="text-xs text-gray-500 mt-1 max-w-[150px] truncate" title={org.suspended_reason}>
                        {org.suspended_reason.replace(/Confirmation word: [A-Z]+-\d+/, '').trim() || 'Manual suspension'}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(org.created_at, 'MMM d, yyyy')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionMenuOrg(actionMenuOrg === org.id ? null : org.id);
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <MoreVertical className="h-5 w-5 text-gray-500" />
                      </button>
                      {actionMenuOrg === org.id && (
                        <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAddAdminModal(org.id);
                              setActionMenuOrg(null);
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <UserPlus className="h-4 w-4" />
                            Add Admin
                          </button>
                          {org.status === 'active' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSuspendModal({ org, step: 1 });
                                setActionMenuOrg(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-yellow-700 hover:bg-yellow-50"
                            >
                              <Ban className="h-4 w-4" />
                              Suspend
                            </button>
                          )}
                          {org.status === 'suspended' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                unsuspendMutation.mutate(org.id);
                                setActionMenuOrg(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                            >
                              <CheckCircle className="h-4 w-4" />
                              Reactivate
                            </button>
                          )}
                          {org.status === 'pending_deletion' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                cancelDeletionMutation.mutate(org.id);
                                setActionMenuOrg(null);
                              }}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                            >
                              <XCircle className="h-4 w-4" />
                              Cancel Deletion
                            </button>
                          )}
                          <hr className="my-1" />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteModal({ org, step: 1 });
                              setActionMenuOrg(null);
                            }}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete Organization
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
                {expandedOrgId === org.id && (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 bg-gray-50">
                      {detailsLoading ? (
                        <div className="flex justify-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                        </div>
                      ) : orgDetails ? (
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <h4 className="font-medium text-gray-900 mb-3">Statistics</h4>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="text-center p-3 bg-white rounded-lg border">
                                <FileText className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                                <p className="text-2xl font-bold text-gray-900">{orgDetails.stats.posts}</p>
                                <p className="text-xs text-gray-500">Posts</p>
                              </div>
                              <div className="text-center p-3 bg-white rounded-lg border">
                                <FileText className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                                <p className="text-2xl font-bold text-gray-900">{orgDetails.stats.pages}</p>
                                <p className="text-xs text-gray-500">Pages</p>
                              </div>
                              <div className="text-center p-3 bg-white rounded-lg border">
                                <Globe className="h-5 w-5 text-gray-400 mx-auto mb-1" />
                                <p className="text-2xl font-bold text-gray-900">{orgDetails.stats.sites}</p>
                                <p className="text-xs text-gray-500">Sites</p>
                              </div>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900 mb-3">Members ({orgDetails.members.length})</h4>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {orgDetails.members.map((member) => (
                                <div key={member.id} className="flex items-center justify-between p-2 bg-white rounded-lg border">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">
                                      {member.first_name} {member.last_name}
                                    </p>
                                    <p className="text-xs text-gray-500">{member.email}</p>
                                  </div>
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    member.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                                    member.role === 'admin' ? 'bg-blue-100 text-blue-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {member.role}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {paginatedOrgs.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">No organizations found</p>
          </div>
        )}

        {/* Pagination */}
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-600">
              Showing {startIndex} to {endIndex} of {totalCount} organizations
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

      {/* Click outside to close action menu */}
      {actionMenuOrg && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setActionMenuOrg(null)}
        />
      )}

      {/* Add Admin Modal */}
      {showAddAdminModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Add Admin to Organization
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createAdminMutation.mutate({
                  orgId: showAddAdminModal,
                  data: newAdminData,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={newAdminData.email}
                  onChange={(e) =>
                    setNewAdminData({ ...newAdminData, email: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newAdminData.firstName}
                    onChange={(e) =>
                      setNewAdminData({ ...newAdminData, firstName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newAdminData.lastName}
                    onChange={(e) =>
                      setNewAdminData({ ...newAdminData, lastName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddAdminModal(null);
                    setNewAdminData({ email: '', firstName: '', lastName: '' });
                  }}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createAdminMutation.isPending}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createAdminMutation.isPending ? 'Creating...' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Suspend Modal */}
      {suspendModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            {suspendModal.step === 1 ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-yellow-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Suspend Organization
                  </h3>
                </div>
                <p className="text-gray-600 mb-4">
                  Are you sure you want to suspend <strong>{suspendModal.org.name}</strong>?
                  Users will not be able to access the organization while suspended.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setSuspendModal(null)}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setSuspendModal({ ...suspendModal, step: 2 })}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Suspension Reason
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  Please provide a reason for suspending this organization:
                </p>
                <textarea
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="e.g., Terms of service violation, non-payment, abuse..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 h-24"
                  required
                />
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={() => {
                      setSuspendModal(null);
                      setSuspendReason('');
                    }}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (suspendReason.trim()) {
                        suspendMutation.mutate({
                          orgId: suspendModal.org.id,
                          reason: suspendReason,
                        });
                      }
                    }}
                    disabled={!suspendReason.trim() || suspendMutation.isPending}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                  >
                    {suspendMutation.isPending ? 'Suspending...' : 'Suspend Organization'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            {deleteModal.step === 1 ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <Trash2 className="h-6 w-6 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Delete Organization
                  </h3>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <p className="text-red-800 text-sm font-medium mb-2">
                    This action is irreversible!
                  </p>
                  <p className="text-red-700 text-sm">
                    Deleting <strong>{deleteModal.org.name}</strong> will permanently remove:
                  </p>
                  <ul className="text-red-700 text-sm list-disc list-inside mt-2">
                    <li>All posts and pages</li>
                    <li>All media files</li>
                    <li>All user memberships</li>
                    <li>Subscription and billing data</li>
                  </ul>
                </div>
                <p className="text-gray-600 mb-4">
                  Are you absolutely sure you want to delete this organization?
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setDeleteModal(null)}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => initiateDeletionMutation.mutate(deleteModal.org.id)}
                    disabled={initiateDeletionMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {initiateDeletionMutation.isPending ? 'Processing...' : 'Yes, Delete'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-red-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Confirm Deletion
                  </h3>
                </div>
                <p className="text-gray-600 mb-4">
                  To confirm deletion of <strong>{deleteModal.org.name}</strong>, type the following word:
                </p>
                <div className="bg-gray-100 rounded-lg p-4 mb-4 text-center">
                  <code className="text-2xl font-mono font-bold text-red-600">
                    {deleteModal.confirmationWord}
                  </code>
                </div>
                <input
                  type="text"
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value.toUpperCase())}
                  placeholder="Type the confirmation word"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 font-mono text-center"
                />
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    onClick={() => {
                      cancelDeletionMutation.mutate(deleteModal.org.id);
                      setDeleteModal(null);
                      setDeleteConfirmInput('');
                    }}
                    className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (deleteConfirmInput === deleteModal.confirmationWord) {
                        confirmDeletionMutation.mutate({
                          orgId: deleteModal.org.id,
                          confirmationWord: deleteConfirmInput,
                        });
                      }
                    }}
                    disabled={
                      deleteConfirmInput !== deleteModal.confirmationWord ||
                      confirmDeletionMutation.isPending
                    }
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {confirmDeletionMutation.isPending ? 'Deleting...' : 'Permanently Delete'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
