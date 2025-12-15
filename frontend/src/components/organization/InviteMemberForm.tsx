import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { UserPlus, Mail, X, Clock } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { organizationService, OrganizationInvite } from '../../services/organization';

interface InviteMemberFormProps {
  organizationId: number;
  canInvite: boolean;
}

const roleOptions = [
  { value: 'admin', label: 'Admin', description: 'Full access to organization settings and members' },
  { value: 'editor', label: 'Editor', description: 'Can create and edit content' },
  { value: 'publisher', label: 'Publisher', description: 'Can publish content' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access' },
] as const;

export default function InviteMemberForm({ organizationId, canInvite }: InviteMemberFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'editor' | 'publisher' | 'viewer'>('editor');
  const [customMessage, setCustomMessage] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const queryClient = useQueryClient();

  // Fetch pending invites
  const { data: pendingInvites = [], isLoading: isLoadingInvites } = useQuery({
    queryKey: ['organization-invites', organizationId],
    queryFn: () => organizationService.listPendingInvites(organizationId),
    enabled: canInvite,
  });

  // Invite member mutation
  const inviteMutation = useMutation({
    mutationFn: () =>
      organizationService.inviteMember(organizationId, {
        email,
        role,
        customMessage: customMessage || undefined,
      }),
    onSuccess: () => {
      toast.success(`Invitation sent to ${email}`);
      setEmail('');
      setRole('editor');
      setCustomMessage('');
      setShowInviteForm(false);
      queryClient.invalidateQueries({ queryKey: ['organization-invites'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send invitation');
    },
  });

  // Revoke invite mutation
  const revokeInviteMutation = useMutation({
    mutationFn: (inviteId: number) => organizationService.revokeInvite(organizationId, inviteId),
    onSuccess: () => {
      toast.success('Invitation revoked');
      queryClient.invalidateQueries({ queryKey: ['organization-invites'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to revoke invitation');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    inviteMutation.mutate();
  };

  const handleRevokeInvite = (invite: OrganizationInvite) => {
    if (window.confirm(`Are you sure you want to revoke the invitation for ${invite.email}?`)) {
      revokeInviteMutation.mutate(invite.id);
    }
  };

  const formatExpiresAt = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days <= 0) return 'Expired';
    if (days === 1) return 'Expires tomorrow';
    return `Expires in ${days} days`;
  };

  if (!canInvite) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-gray-500" />
            <h2 className="text-lg font-semibold text-gray-900">Invite Members</h2>
          </div>
          {!showInviteForm && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowInviteForm(true)}
              icon={<UserPlus className="h-4 w-4" />}
            >
              Invite Member
            </Button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Invite Form */}
        {showInviteForm && (
          <form onSubmit={handleSubmit} className="space-y-4 mb-6 pb-6 border-b">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                required
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as typeof role)}
                  className="input"
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {roleOptions.find((o) => o.value === role)?.description}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Personal Message (optional)
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Add a personal note to the invitation email..."
                className="input min-h-[80px]"
                maxLength={500}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowInviteForm(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={inviteMutation.isPending}
                icon={<Mail className="h-4 w-4" />}
              >
                Send Invitation
              </Button>
            </div>
          </form>
        )}

        {/* Pending Invites List */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Pending Invitations
            {pendingInvites.length > 0 && (
              <span className="ml-2 text-gray-500">({pendingInvites.length})</span>
            )}
          </h3>

          {isLoadingInvites ? (
            <div className="text-center py-4 text-gray-500">Loading...</div>
          ) : pendingInvites.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No pending invitations
            </p>
          ) : (
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                      <Mail className="h-4 w-4 text-primary-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{invite.email}</p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="capitalize">{invite.role}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatExpiresAt(invite.expires_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevokeInvite(invite)}
                    disabled={revokeInviteMutation.isPending}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    title="Revoke invitation"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
