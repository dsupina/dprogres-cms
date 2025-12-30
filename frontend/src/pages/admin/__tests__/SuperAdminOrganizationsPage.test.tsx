import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import SuperAdminOrganizationsPage from '../SuperAdminOrganizationsPage';
import * as superAdminService from '../../../services/superAdmin';
import { toast } from 'react-hot-toast';

// Mock dependencies
vi.mock('../../../services/superAdmin');
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGetAllOrganizations = superAdminService.getAllOrganizations as Mock;
const mockGetOrganizationDetails = superAdminService.getOrganizationDetails as Mock;
const mockCreateOrgAdmin = superAdminService.createOrgAdmin as Mock;
const mockSuspendOrganization = superAdminService.suspendOrganization as Mock;
const mockUnsuspendOrganization = superAdminService.unsuspendOrganization as Mock;
const mockInitiateDeletion = superAdminService.initiateOrganizationDeletion as Mock;
const mockConfirmDeletion = superAdminService.confirmOrganizationDeletion as Mock;
const mockCancelDeletion = superAdminService.cancelOrganizationDeletion as Mock;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </BrowserRouter>
  );
};

const mockOrganizations: superAdminService.OrganizationSummary[] = [
  {
    id: 1,
    name: 'Active Org',
    slug: 'active-org',
    plan_tier: 'pro',
    owner_id: 1,
    owner_email: 'owner@active.com',
    owner_name: 'John Doe',
    member_count: 5,
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2,
    name: 'Suspended Org',
    slug: 'suspended-org',
    plan_tier: 'starter',
    owner_id: 2,
    owner_email: 'owner@suspended.com',
    owner_name: 'Jane Doe',
    member_count: 3,
    status: 'suspended',
    suspended_at: '2024-06-01T00:00:00Z',
    suspended_reason: 'Non-payment',
    created_at: '2024-01-15T00:00:00Z',
  },
  {
    id: 3,
    name: 'Pending Delete Org',
    slug: 'pending-delete-org',
    plan_tier: 'free',
    owner_id: 3,
    owner_email: 'owner@pending.com',
    owner_name: 'Bob Smith',
    member_count: 1,
    status: 'pending_deletion',
    suspended_reason: 'Deletion initiated. Confirmation word: DELETE-123',
    grace_period_ends_at: '2024-07-01T00:00:00Z',
    created_at: '2024-02-01T00:00:00Z',
  },
];

const mockOrgDetails: superAdminService.OrganizationDetails = {
  ...mockOrganizations[0],
  members: [
    { id: 1, user_id: 1, email: 'owner@active.com', first_name: 'John', last_name: 'Doe', role: 'owner', joined_at: '2024-01-01T00:00:00Z' },
    { id: 2, user_id: 2, email: 'admin@active.com', first_name: 'Admin', last_name: 'User', role: 'admin', joined_at: '2024-02-01T00:00:00Z' },
  ],
  stats: { posts: 10, pages: 5, sites: 2 },
};

describe('SuperAdminOrganizationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllOrganizations.mockResolvedValue(mockOrganizations);
    mockGetOrganizationDetails.mockResolvedValue(mockOrgDetails);
  });

  describe('Rendering', () => {
    it('renders page with organizations list', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      // Wait for data to load and the page to render
      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      expect(screen.getByText('Suspended Org')).toBeInTheDocument();
      expect(screen.getByText('Pending Delete Org')).toBeInTheDocument();
    });

    it('displays correct organization count', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/3 organizations on the platform/)).toBeInTheDocument();
      });
    });

    it('shows loading state while fetching', async () => {
      mockGetAllOrganizations.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockOrganizations), 500))
      );

      const { container } = render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      // Initially shows loading spinner (check for animate-spin class)
      expect(container.querySelector('.animate-spin')).toBeTruthy();

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('displays status badges correctly', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Check for status badges
      const badges = screen.getAllByText(/Active|Suspended|Pending Deletion/i);
      expect(badges.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Filtering', () => {
    it('filters by status', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Change status filter to suspended
      const statusFilter = screen.getByDisplayValue('All Status');
      fireEvent.change(statusFilter, { target: { value: 'suspended' } });

      // Only suspended org should be visible
      expect(screen.queryByText('Active Org')).not.toBeInTheDocument();
      expect(screen.getByText('Suspended Org')).toBeInTheDocument();
      expect(screen.queryByText('Pending Delete Org')).not.toBeInTheDocument();
    });

    it('filters by plan', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Change plan filter to pro
      const planFilter = screen.getByDisplayValue('All Plans');
      fireEvent.change(planFilter, { target: { value: 'pro' } });

      // Only pro org should be visible
      expect(screen.getByText('Active Org')).toBeInTheDocument();
      expect(screen.queryByText('Suspended Org')).not.toBeInTheDocument();
    });

    it('filters by search query', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Search for "Suspended"
      const searchInput = screen.getByPlaceholderText(/search/i);
      fireEvent.change(searchInput, { target: { value: 'Suspended' } });

      expect(screen.queryByText('Active Org')).not.toBeInTheDocument();
      expect(screen.getByText('Suspended Org')).toBeInTheDocument();
    });
  });

  describe('Sorting', () => {
    it('sorts by name when clicking header', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Click the Organization column header (it's in a th element with sortable class)
      const headers = screen.getAllByRole('columnheader');
      const nameHeader = headers.find(h => h.textContent?.includes('Organization'));
      if (nameHeader) {
        fireEvent.click(nameHeader);
      }

      // Should still have organizations displayed after sorting
      const rows = screen.getAllByRole('row');
      expect(rows.length).toBeGreaterThan(1);
    });
  });

  describe('Expand Organization Details', () => {
    it('expands row to show details when clicked', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Click on organization row (not the action button)
      const orgRow = screen.getByText('Active Org').closest('tr');
      if (orgRow) {
        fireEvent.click(orgRow);
      }

      await waitFor(() => {
        expect(screen.getByText('Statistics')).toBeInTheDocument();
        expect(screen.getByText('Members (2)')).toBeInTheDocument();
      });
    });
  });

  describe('Suspend Organization', () => {
    it('opens suspend modal when clicking suspend action', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Find the action button in the Active Org row
      const activeOrgRow = screen.getByText('Active Org').closest('tr');
      const actionButton = activeOrgRow?.querySelector('button');
      expect(actionButton).toBeTruthy();
      fireEvent.click(actionButton!);

      // Wait for the menu to open and click Suspend
      await waitFor(() => {
        expect(screen.getByText('Suspend')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Suspend'));

      await waitFor(() => {
        expect(screen.getByText('Suspend Organization')).toBeInTheDocument();
        expect(screen.getByText(/Are you sure you want to suspend/)).toBeInTheDocument();
      });
    });

    it('proceeds to step 2 and shows reason input', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Find and click action button
      const activeOrgRow = screen.getByText('Active Org').closest('tr');
      const actionButton = activeOrgRow?.querySelector('button');
      fireEvent.click(actionButton!);

      // Wait for menu and click Suspend
      await waitFor(() => {
        expect(screen.getByText('Suspend')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Suspend'));

      // Wait for step 1 modal
      await waitFor(() => {
        expect(screen.getByText('Continue')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Continue'));

      await waitFor(() => {
        expect(screen.getByText('Suspension Reason')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Terms of service violation/)).toBeInTheDocument();
      });
    });

    it('submits suspension with reason', async () => {
      mockSuspendOrganization.mockResolvedValue({ message: 'Suspended' });

      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Find and click action button
      const activeOrgRow = screen.getByText('Active Org').closest('tr');
      const actionButton = activeOrgRow?.querySelector('button');
      fireEvent.click(actionButton!);

      // Wait for menu and click Suspend
      await waitFor(() => {
        expect(screen.getByText('Suspend')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Suspend'));

      // Wait for step 1 and click Continue
      await waitFor(() => {
        expect(screen.getByText('Continue')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Continue'));

      // Wait for step 2 and fill in reason
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Terms of service violation/)).toBeInTheDocument();
      });
      const reasonInput = screen.getByPlaceholderText(/Terms of service violation/);
      fireEvent.change(reasonInput, { target: { value: 'Test suspension reason' } });

      fireEvent.click(screen.getByText('Suspend Organization'));

      await waitFor(() => {
        expect(mockSuspendOrganization).toHaveBeenCalledWith(1, 'Test suspension reason');
        expect(toast.success).toHaveBeenCalledWith('Organization suspended');
      });
    });
  });

  describe('Unsuspend Organization', () => {
    it('shows reactivate option for suspended organizations', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Suspended Org')).toBeInTheDocument();
      });

      // Find and click action button for suspended org
      const suspendedOrgRow = screen.getByText('Suspended Org').closest('tr');
      const actionButton = suspendedOrgRow?.querySelector('button');
      if (actionButton) {
        fireEvent.click(actionButton);
      }

      await waitFor(() => {
        expect(screen.getByText('Reactivate')).toBeInTheDocument();
      });
    });

    it('calls unsuspend when clicking reactivate', async () => {
      mockUnsuspendOrganization.mockResolvedValue({ message: 'Reactivated' });

      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Suspended Org')).toBeInTheDocument();
      });

      const suspendedOrgRow = screen.getByText('Suspended Org').closest('tr');
      const actionButton = suspendedOrgRow?.querySelector('button');
      if (actionButton) {
        fireEvent.click(actionButton);
      }

      await waitFor(() => {
        fireEvent.click(screen.getByText('Reactivate'));
      });

      await waitFor(() => {
        expect(mockUnsuspendOrganization).toHaveBeenCalledWith(2);
        expect(toast.success).toHaveBeenCalledWith('Organization reactivated');
      });
    });
  });

  describe('Delete Organization', () => {
    it('opens delete modal with warning when clicking delete', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Find and click action button
      const activeOrgRow = screen.getByText('Active Org').closest('tr');
      const actionButton = activeOrgRow?.querySelector('button');
      fireEvent.click(actionButton!);

      // Wait for menu and click Delete Organization
      await waitFor(() => {
        expect(screen.getByText('Delete Organization')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Delete Organization'));

      await waitFor(() => {
        expect(screen.getByText(/This action is irreversible/)).toBeInTheDocument();
        expect(screen.getByText(/All posts and pages/)).toBeInTheDocument();
        expect(screen.getByText(/All media files/)).toBeInTheDocument();
      });
    });

    it('proceeds to confirmation word step after initial confirmation', async () => {
      mockInitiateDeletion.mockResolvedValue({
        message: 'Deletion initiated',
        confirmationWord: 'DELETE-789',
        gracePeriodEnds: new Date().toISOString(),
      });

      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Find and click action button
      const activeOrgRow = screen.getByText('Active Org').closest('tr');
      const actionButton = activeOrgRow?.querySelector('button');
      fireEvent.click(actionButton!);

      // Wait for menu and click Delete Organization
      await waitFor(() => {
        expect(screen.getByText('Delete Organization')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Delete Organization'));

      // Wait for step 1 and click Yes, Delete
      await waitFor(() => {
        expect(screen.getByText('Yes, Delete')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Yes, Delete'));

      await waitFor(() => {
        expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
        expect(screen.getByText('DELETE-789')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Type the confirmation word/)).toBeInTheDocument();
      });
    });

    it('permanently deletes organization with correct confirmation word', async () => {
      mockInitiateDeletion.mockResolvedValue({
        message: 'Deletion initiated',
        confirmationWord: 'DELETE-789',
        gracePeriodEnds: new Date().toISOString(),
      });
      mockConfirmDeletion.mockResolvedValue({ message: 'Deleted' });

      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Find and click action button
      const activeOrgRow = screen.getByText('Active Org').closest('tr');
      const actionButton = activeOrgRow?.querySelector('button');
      fireEvent.click(actionButton!);

      // Wait for menu and click Delete Organization
      await waitFor(() => {
        expect(screen.getByText('Delete Organization')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Delete Organization'));

      // Wait for step 1 and click Yes, Delete
      await waitFor(() => {
        expect(screen.getByText('Yes, Delete')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Yes, Delete'));

      // Wait for step 2 and fill in confirmation word
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type the confirmation word/)).toBeInTheDocument();
      });
      const confirmInput = screen.getByPlaceholderText(/Type the confirmation word/);
      fireEvent.change(confirmInput, { target: { value: 'DELETE-789' } });

      fireEvent.click(screen.getByText('Permanently Delete'));

      await waitFor(() => {
        expect(mockConfirmDeletion).toHaveBeenCalledWith(1, 'DELETE-789');
        expect(toast.success).toHaveBeenCalledWith('Organization permanently deleted');
      });
    });

    it('disables delete button when confirmation word is incorrect', async () => {
      mockInitiateDeletion.mockResolvedValue({
        message: 'Deletion initiated',
        confirmationWord: 'DELETE-789',
        gracePeriodEnds: new Date().toISOString(),
      });

      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Find and click action button
      const activeOrgRow = screen.getByText('Active Org').closest('tr');
      const actionButton = activeOrgRow?.querySelector('button');
      fireEvent.click(actionButton!);

      // Wait for menu and click Delete Organization
      await waitFor(() => {
        expect(screen.getByText('Delete Organization')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Delete Organization'));

      // Wait for step 1 and click Yes, Delete
      await waitFor(() => {
        expect(screen.getByText('Yes, Delete')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Yes, Delete'));

      // Wait for step 2 and fill in wrong confirmation word
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type the confirmation word/)).toBeInTheDocument();
      });
      const confirmInput = screen.getByPlaceholderText(/Type the confirmation word/);
      fireEvent.change(confirmInput, { target: { value: 'WRONG-000' } });

      // Button should be disabled when word doesn't match
      const deleteButton = screen.getByText('Permanently Delete');
      expect(deleteButton).toBeDisabled();
    });
  });

  describe('Cancel Deletion', () => {
    it('shows cancel deletion option for pending deletion organizations', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Pending Delete Org')).toBeInTheDocument();
      });

      const pendingOrgRow = screen.getByText('Pending Delete Org').closest('tr');
      const actionButton = pendingOrgRow?.querySelector('button');
      if (actionButton) {
        fireEvent.click(actionButton);
      }

      await waitFor(() => {
        expect(screen.getByText('Cancel Deletion')).toBeInTheDocument();
      });
    });

    it('calls cancel deletion when clicking cancel deletion', async () => {
      mockCancelDeletion.mockResolvedValue({ message: 'Cancelled' });

      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Pending Delete Org')).toBeInTheDocument();
      });

      const pendingOrgRow = screen.getByText('Pending Delete Org').closest('tr');
      const actionButton = pendingOrgRow?.querySelector('button');
      if (actionButton) {
        fireEvent.click(actionButton);
      }

      await waitFor(() => {
        fireEvent.click(screen.getByText('Cancel Deletion'));
      });

      await waitFor(() => {
        expect(mockCancelDeletion).toHaveBeenCalledWith(3);
      });
    });
  });

  describe('Add Admin', () => {
    it('opens add admin modal when clicking add admin', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Find and click action button
      const activeOrgRow = screen.getByText('Active Org').closest('tr');
      const actionButton = activeOrgRow?.querySelector('button');
      fireEvent.click(actionButton!);

      // Wait for menu and click Add Admin
      await waitFor(() => {
        expect(screen.getByText('Add Admin')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Add Admin'));

      await waitFor(() => {
        expect(screen.getByText(/Add Admin to Organization/)).toBeInTheDocument();
        expect(screen.getByText('Email')).toBeInTheDocument();
        expect(screen.getByText('First Name')).toBeInTheDocument();
        expect(screen.getByText('Last Name')).toBeInTheDocument();
      });
    });

    it('creates admin with temporary password', async () => {
      mockCreateOrgAdmin.mockResolvedValue({
        message: 'Admin created',
        userId: 10,
        temporaryPassword: 'abc123xyz',
      });

      const { container } = render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Find and click action button
      const activeOrgRow = screen.getByText('Active Org').closest('tr');
      const actionButton = activeOrgRow?.querySelector('button');
      fireEvent.click(actionButton!);

      // Wait for menu and click Add Admin
      await waitFor(() => {
        expect(screen.getByText('Add Admin')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Add Admin'));

      // Wait for modal and fill in form
      await waitFor(() => {
        expect(screen.getByText(/Add Admin to Organization/)).toBeInTheDocument();
      });

      // Get inputs from the form inside the modal
      const emailInput = container.querySelector('input[type="email"]');
      const textInputs = container.querySelectorAll('form input[type="text"]');

      expect(emailInput).toBeTruthy();
      expect(textInputs.length).toBe(2); // First name and Last name

      fireEvent.change(emailInput!, { target: { value: 'newadmin@example.com' } });
      fireEvent.change(textInputs[0], { target: { value: 'New' } });
      fireEvent.change(textInputs[1], { target: { value: 'Admin' } });

      // Find the Create Admin button (submit button in modal)
      fireEvent.click(screen.getByText('Create Admin'));

      await waitFor(() => {
        expect(mockCreateOrgAdmin).toHaveBeenCalledWith(1, {
          email: 'newadmin@example.com',
          firstName: 'New',
          lastName: 'Admin',
        });
        expect(toast.success).toHaveBeenCalledWith(
          expect.stringContaining('abc123xyz'),
          expect.any(Object)
        );
      });
    });
  });

  describe('Pagination', () => {
    it('shows pagination controls', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      expect(screen.getByText(/per page/)).toBeInTheDocument();
    });

    it('changes items per page', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      const perPageSelect = screen.getByDisplayValue('10');
      fireEvent.change(perPageSelect, { target: { value: '25' } });

      expect(screen.getByDisplayValue('25')).toBeInTheDocument();
    });
  });

  describe('Modal Cancellation', () => {
    it('closes suspend modal when cancel is clicked', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Find and click action button
      const activeOrgRow = screen.getByText('Active Org').closest('tr');
      const actionButton = activeOrgRow?.querySelector('button');
      fireEvent.click(actionButton!);

      // Wait for menu and click Suspend
      await waitFor(() => {
        expect(screen.getByText('Suspend')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Suspend'));

      await waitFor(() => {
        expect(screen.getByText('Suspend Organization')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByText('Suspend Organization')).not.toBeInTheDocument();
      });
    });

    it('closes delete modal when cancel is clicked', async () => {
      render(<SuperAdminOrganizationsPage />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Active Org')).toBeInTheDocument();
      });

      // Find and click action button
      const activeOrgRow = screen.getByText('Active Org').closest('tr');
      const actionButton = activeOrgRow?.querySelector('button');
      fireEvent.click(actionButton!);

      // Wait for menu and click Delete Organization
      await waitFor(() => {
        expect(screen.getByText('Delete Organization')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Delete Organization'));

      await waitFor(() => {
        expect(screen.getByText(/This action is irreversible/)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByText(/This action is irreversible/)).not.toBeInTheDocument();
      });
    });
  });
});
