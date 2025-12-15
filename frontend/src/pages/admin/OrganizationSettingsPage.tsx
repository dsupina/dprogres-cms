import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Building2 } from 'lucide-react';
import {
  OrganizationDetailsForm,
  MembersTable,
  InviteMemberForm,
  TransferOwnershipModal,
} from '../../components/organization';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { organizationService } from '../../services/organization';
import { useAuthStore } from '../../lib/auth';

export default function OrganizationSettingsPage() {
  const [transferModalData, setTransferModalData] = useState<{
    memberId: number;
    memberName: string;
  } | null>(null);

  const { user } = useAuthStore();

  // Fetch current organization
  const {
    data: organization,
    isLoading: isOrgLoading,
    error: orgError,
    refetch: refetchOrg,
  } = useQuery({
    queryKey: ['organization'],
    queryFn: organizationService.getCurrentOrganization,
    staleTime: 30000,
  });

  // Fetch members
  const {
    data: members = [],
    isLoading: isMembersLoading,
    error: membersError,
    refetch: refetchMembers,
  } = useQuery({
    queryKey: ['organization-members', organization?.id],
    queryFn: () => organizationService.listMembers(organization!.id),
    enabled: !!organization?.id,
    staleTime: 30000,
  });

  const handleRefresh = () => {
    refetchOrg();
    refetchMembers();
  };

  const handleTransferOwnership = (memberId: number, memberName: string) => {
    setTransferModalData({ memberId, memberName });
  };

  // Loading state
  if (isOrgLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Error state
  if (orgError || !organization) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Failed to load organization</h2>
        <p className="text-sm text-red-600 mb-4">
          {(orgError as Error)?.message || 'Organization not found'}
        </p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const userRole = organization.user_role || 'viewer';
  const canEdit = userRole === 'owner';
  const canManageMembers = ['owner', 'admin'].includes(userRole);
  const currentUserId = user?.id || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-gray-400" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Organization Settings</h1>
            <p className="text-gray-600">Manage your organization and team members</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Refresh data"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* Organization Details */}
      <OrganizationDetailsForm organization={organization} canEdit={canEdit} />

      {/* Members Section */}
      {membersError ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <p className="text-sm text-red-600">
            Failed to load members: {(membersError as Error)?.message}
          </p>
        </div>
      ) : isMembersLoading ? (
        <div className="bg-white rounded-lg shadow p-8">
          <div className="flex items-center justify-center">
            <LoadingSpinner size="md" />
          </div>
        </div>
      ) : (
        <MembersTable
          organizationId={organization.id}
          members={members}
          currentUserRole={userRole}
          currentUserId={currentUserId}
          onTransferOwnership={handleTransferOwnership}
        />
      )}

      {/* Invite Members */}
      <InviteMemberForm organizationId={organization.id} canInvite={canManageMembers} />

      {/* Transfer Ownership Modal */}
      {transferModalData && (
        <TransferOwnershipModal
          organizationId={organization.id}
          organizationName={organization.name}
          newOwnerId={transferModalData.memberId}
          newOwnerName={transferModalData.memberName}
          onClose={() => setTransferModalData(null)}
        />
      )}
    </div>
  );
}
