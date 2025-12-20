import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Users, MoreVertical, UserMinus, Shield } from 'lucide-react';
import { organizationService, OrganizationMember } from '../../services/organization';

interface MembersTableProps {
  organizationId: number;
  members: OrganizationMember[];
  currentUserRole: string;
  currentUserId: number;
  onTransferOwnership: (memberId: number, memberName: string) => void;
}

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  publisher: 'Publisher',
  viewer: 'Viewer',
};

const roleColors: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  editor: 'bg-green-100 text-green-800',
  publisher: 'bg-yellow-100 text-yellow-800',
  viewer: 'bg-gray-100 text-gray-800',
};

export default function MembersTable({
  organizationId,
  members,
  currentUserRole,
  currentUserId,
  onTransferOwnership,
}: MembersTableProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const canManageMembers = ['owner', 'admin'].includes(currentUserRole);

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: number; role: 'admin' | 'editor' | 'publisher' | 'viewer' }) =>
      organizationService.updateMemberRole(organizationId, memberId, { role }),
    onSuccess: () => {
      toast.success('Member role updated');
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      setOpenMenu(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update member role');
    },
  });

  // Remove member mutation
  const removeMemberMutation = useMutation({
    mutationFn: (memberId: number) => organizationService.removeMember(organizationId, memberId),
    onSuccess: () => {
      toast.success('Member removed');
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      setOpenMenu(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove member');
    },
  });

  const handleRoleChange = (memberId: number, newRole: 'admin' | 'editor' | 'publisher' | 'viewer') => {
    updateRoleMutation.mutate({ memberId, role: newRole });
  };

  const handleRemoveMember = (member: OrganizationMember) => {
    if (window.confirm(`Are you sure you want to remove ${member.user_name || member.user_email} from the organization?`)) {
      removeMemberMutation.mutate(member.id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
          <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
            {members.length}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Member
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Joined
              </th>
              {canManageMembers && (
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {members.map((member) => {
              const isCurrentUser = member.user_id === currentUserId;
              const isOwner = member.role === 'owner';
              const canModify = canManageMembers && !isCurrentUser && !isOwner;

              return (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary-700">
                          {(member.user_name || member.user_email)[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {member.user_name || 'No name'}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-gray-500">(You)</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">{member.user_email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${roleColors[member.role]}`}>
                      {roleLabels[member.role]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(member.joined_at)}
                  </td>
                  {canManageMembers && (
                    <td className="px-6 py-4 text-right">
                      {canModify && (
                        <div className="relative inline-block text-left">
                          <button
                            onClick={() => setOpenMenu(openMenu === member.id ? null : member.id)}
                            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          {openMenu === member.id && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-10">
                              <div className="py-1">
                                <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">
                                  Change Role
                                </div>
                                {(['admin', 'editor', 'publisher', 'viewer'] as const).map((role) => (
                                  <button
                                    key={role}
                                    onClick={() => handleRoleChange(member.id, role)}
                                    disabled={member.role === role || updateRoleMutation.isPending}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2 ${
                                      member.role === role ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                                    }`}
                                  >
                                    <Shield className="h-3 w-3" />
                                    {roleLabels[role]}
                                  </button>
                                ))}
                                <div className="border-t my-1"></div>
                                {currentUserRole === 'owner' && (
                                  <button
                                    onClick={() => {
                                      setOpenMenu(null);
                                      onTransferOwnership(member.user_id, member.user_name || member.user_email);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 flex items-center gap-2"
                                  >
                                    <Shield className="h-3 w-3" />
                                    Make Owner
                                  </button>
                                )}
                                <button
                                  onClick={() => handleRemoveMember(member)}
                                  disabled={removeMemberMutation.isPending}
                                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                >
                                  <UserMinus className="h-3 w-3" />
                                  Remove Member
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {isOwner && (
                        <span className="text-xs text-gray-400">Organization owner</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Click outside to close menu */}
      {openMenu && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setOpenMenu(null)}
        />
      )}
    </div>
  );
}
