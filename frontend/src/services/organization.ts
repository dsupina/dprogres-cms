import api from '@/lib/api';

// Types
export interface Organization {
  id: number;
  name: string;
  slug: string;
  owner_id: number;
  plan_tier: 'free' | 'starter' | 'pro' | 'enterprise';
  logo_url?: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  user_role?: 'owner' | 'admin' | 'editor' | 'publisher' | 'viewer';
}

export interface OrganizationMember {
  id: number;
  organization_id: number;
  user_id: number;
  role: 'owner' | 'admin' | 'editor' | 'publisher' | 'viewer';
  invited_by?: number;
  joined_at: string;
  user_email: string;
  user_name?: string;
  inviter_email?: string;
  inviter_name?: string;
}

export interface OrganizationInvite {
  id: number;
  organization_id: number;
  email: string;
  role: 'admin' | 'editor' | 'publisher' | 'viewer';
  invited_by: number;
  expires_at: string;
  created_at: string;
}

export interface UpdateOrganizationInput {
  name?: string;
  logoUrl?: string;
}

export interface InviteMemberInput {
  email: string;
  role: 'admin' | 'editor' | 'publisher' | 'viewer';
  customMessage?: string;
}

export interface UpdateMemberRoleInput {
  role: 'admin' | 'editor' | 'publisher' | 'viewer';
}

export interface TransferOwnershipInput {
  newOwnerId: number;
}

// API Response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Service methods
export const organizationService = {
  /**
   * Get the current user's organization
   */
  getCurrentOrganization: async (): Promise<Organization> => {
    const response = await api.get<ApiResponse<Organization>>('/organizations/current');
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get organization');
    }
    return response.data.data;
  },

  /**
   * Get organization by ID
   */
  getOrganization: async (organizationId: number): Promise<Organization> => {
    const response = await api.get<ApiResponse<Organization>>(`/organizations/${organizationId}`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get organization');
    }
    return response.data.data;
  },

  /**
   * Update organization details
   */
  updateOrganization: async (organizationId: number, data: UpdateOrganizationInput): Promise<Organization> => {
    const response = await api.put<ApiResponse<Organization>>(`/organizations/${organizationId}`, data);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to update organization');
    }
    return response.data.data;
  },

  /**
   * Upload organization logo
   */
  uploadLogo: async (organizationId: number, file: File): Promise<{ logoUrl: string }> => {
    const formData = new FormData();
    formData.append('logo', file);

    const response = await api.post<ApiResponse<{ logoUrl: string }>>(
      `/organizations/${organizationId}/logo`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to upload logo');
    }
    return response.data.data;
  },

  /**
   * List all members of an organization
   */
  listMembers: async (organizationId: number): Promise<OrganizationMember[]> => {
    const response = await api.get<ApiResponse<OrganizationMember[]>>(`/organizations/${organizationId}/members`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to list members');
    }
    return response.data.data;
  },

  /**
   * Invite a new member to the organization
   */
  inviteMember: async (organizationId: number, data: InviteMemberInput): Promise<OrganizationInvite> => {
    const response = await api.post<ApiResponse<OrganizationInvite>>(
      `/organizations/${organizationId}/invites`,
      data
    );
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to invite member');
    }
    return response.data.data;
  },

  /**
   * List pending invitations for an organization
   */
  listPendingInvites: async (organizationId: number): Promise<OrganizationInvite[]> => {
    const response = await api.get<ApiResponse<OrganizationInvite[]>>(`/organizations/${organizationId}/invites`);
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to list invites');
    }
    return response.data.data;
  },

  /**
   * Revoke a pending invitation
   */
  revokeInvite: async (organizationId: number, inviteId: number): Promise<void> => {
    const response = await api.delete<ApiResponse<void>>(`/organizations/${organizationId}/invites/${inviteId}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to revoke invitation');
    }
  },

  /**
   * Update a member's role
   */
  updateMemberRole: async (
    organizationId: number,
    memberId: number,
    data: UpdateMemberRoleInput
  ): Promise<OrganizationMember> => {
    const response = await api.put<ApiResponse<OrganizationMember>>(
      `/organizations/${organizationId}/members/${memberId}/role`,
      data
    );
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to update member role');
    }
    return response.data.data;
  },

  /**
   * Remove a member from the organization
   */
  removeMember: async (organizationId: number, memberId: number): Promise<void> => {
    const response = await api.delete<ApiResponse<void>>(`/organizations/${organizationId}/members/${memberId}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to remove member');
    }
  },

  /**
   * Transfer organization ownership to another member
   */
  transferOwnership: async (organizationId: number, data: TransferOwnershipInput): Promise<Organization> => {
    const response = await api.post<ApiResponse<Organization>>(
      `/organizations/${organizationId}/transfer-ownership`,
      data
    );
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to transfer ownership');
    }
    return response.data.data;
  },
};

export default organizationService;
