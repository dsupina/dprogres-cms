import api from '../lib/api';

export interface PlatformMetrics {
  organizations: {
    total: number;
    byPlanTier: Record<string, number>;
    newLast30Days: number;
  };
  users: {
    total: number;
    superAdmins: number;
    newLast30Days: number;
  };
  content: {
    totalPosts: number;
    totalPages: number;
    totalMedia: number;
  };
  revenue: {
    activeSubscriptions: number;
    mrr: number;
  };
}

export type OrganizationStatus = 'active' | 'suspended' | 'pending_deletion';

export interface OrganizationSummary {
  id: number;
  name: string;
  slug: string;
  plan_tier: string;
  owner_id: number;
  owner_email: string;
  owner_name: string;
  member_count: number;
  status: OrganizationStatus;
  suspended_at?: string;
  suspended_reason?: string;
  grace_period_ends_at?: string;
  created_at: string;
}

export interface OrganizationMember {
  id: number;
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  joined_at: string;
}

export interface OrganizationDetails extends OrganizationSummary {
  members: OrganizationMember[];
  stats: {
    posts: number;
    pages: number;
    sites: number;
  };
}

export interface UserOrganization {
  id: number;
  name: string;
  role: string;
}

export interface UserSummary {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_super_admin: boolean;
  email_verified: boolean;
  created_at: string;
  organizations: UserOrganization[];
}

export interface CreateOrgAdminData {
  email: string;
  firstName: string;
  lastName: string;
}

export interface CreateOrgAdminResponse {
  message: string;
  userId: number;
  temporaryPassword: string;
}

// Get platform-wide metrics for the dashboard
export const getDashboardMetrics = async (): Promise<PlatformMetrics> => {
  const response = await api.get<PlatformMetrics>('/super-admin/dashboard');
  return response.data;
};

// List all organizations
export const getAllOrganizations = async (): Promise<OrganizationSummary[]> => {
  const response = await api.get<OrganizationSummary[]>('/super-admin/organizations');
  return response.data;
};

// Get detailed organization info
export const getOrganizationDetails = async (orgId: number): Promise<OrganizationDetails> => {
  const response = await api.get<OrganizationDetails>(`/super-admin/organizations/${orgId}`);
  return response.data;
};

// Create a new admin for an organization
export const createOrgAdmin = async (
  orgId: number,
  data: CreateOrgAdminData
): Promise<CreateOrgAdminResponse> => {
  const response = await api.post<CreateOrgAdminResponse>(
    `/super-admin/organizations/${orgId}/admins`,
    data
  );
  return response.data;
};

// List all users
export const getAllUsers = async (): Promise<UserSummary[]> => {
  const response = await api.get<UserSummary[]>('/super-admin/users');
  return response.data;
};

// Toggle super admin status
export const toggleSuperAdminStatus = async (
  userId: number,
  isSuperAdmin: boolean
): Promise<{ message: string }> => {
  const response = await api.put<{ message: string }>(
    `/super-admin/users/${userId}/super-admin`,
    { isSuperAdmin }
  );
  return response.data;
};

// Suspend an organization
export const suspendOrganization = async (
  orgId: number,
  reason: string
): Promise<{ message: string }> => {
  const response = await api.post<{ message: string }>(
    `/super-admin/organizations/${orgId}/suspend`,
    { reason }
  );
  return response.data;
};

// Unsuspend/reactivate an organization
export const unsuspendOrganization = async (
  orgId: number
): Promise<{ message: string }> => {
  const response = await api.post<{ message: string }>(
    `/super-admin/organizations/${orgId}/unsuspend`
  );
  return response.data;
};

// Initiate organization deletion (returns confirmation word)
export interface InitiateDeletionResponse {
  message: string;
  confirmationWord: string;
  gracePeriodEnds: string;
}

export const initiateOrganizationDeletion = async (
  orgId: number
): Promise<InitiateDeletionResponse> => {
  const response = await api.post<InitiateDeletionResponse>(
    `/super-admin/organizations/${orgId}/initiate-deletion`
  );
  return response.data;
};

// Confirm organization deletion with confirmation word
export const confirmOrganizationDeletion = async (
  orgId: number,
  confirmationWord: string
): Promise<{ message: string }> => {
  const response = await api.post<{ message: string }>(
    `/super-admin/organizations/${orgId}/confirm-deletion`,
    { confirmationWord }
  );
  return response.data;
};

// Cancel pending organization deletion
export const cancelOrganizationDeletion = async (
  orgId: number
): Promise<{ message: string }> => {
  const response = await api.post<{ message: string }>(
    `/super-admin/organizations/${orgId}/cancel-deletion`
  );
  return response.data;
};

// Get organization status
export interface OrganizationStatusResponse {
  status: OrganizationStatus;
  suspended_at?: string;
  suspended_reason?: string;
  grace_period_ends_at?: string;
  days_until_suspension?: number;
  has_overdue_invoices: boolean;
}

export const getOrganizationStatus = async (
  orgId: number
): Promise<OrganizationStatusResponse> => {
  const response = await api.get<OrganizationStatusResponse>(
    `/super-admin/organizations/${orgId}/status`
  );
  return response.data;
};
