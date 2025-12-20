import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InviteMemberForm from '../InviteMemberForm';
import { organizationService } from '../../../services/organization';
import type { OrganizationInvite } from '../../../services/organization';

// Mock the organization service
vi.mock('../../../services/organization', () => ({
  organizationService: {
    inviteMember: vi.fn(),
    listPendingInvites: vi.fn(),
    revokeInvite: vi.fn(),
  },
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const renderWithQueryClient = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
};

describe('InviteMemberForm', () => {
  const mockInviteMember = organizationService.inviteMember as ReturnType<typeof vi.fn>;
  const mockListPendingInvites = organizationService.listPendingInvites as ReturnType<typeof vi.fn>;
  const mockRevokeInvite = organizationService.revokeInvite as ReturnType<typeof vi.fn>;

  const defaultProps = {
    organizationId: 1,
    canInvite: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockListPendingInvites.mockResolvedValue([]);
  });

  describe('Form Display', () => {
    it('renders invite section when canInvite is true', async () => {
      renderWithQueryClient(
        <InviteMemberForm {...defaultProps} />
      );

      expect(screen.getByText('Invite Members')).toBeInTheDocument();
      expect(screen.getByText('Invite Member')).toBeInTheDocument();
    });

    it('returns null when canInvite is false', () => {
      const { container } = renderWithQueryClient(
        <InviteMemberForm {...defaultProps} canInvite={false} />
      );

      expect(container.firstChild).toBeNull();
    });

    it('shows invite form when Invite Member button is clicked', async () => {
      const user = userEvent.setup();

      renderWithQueryClient(
        <InviteMemberForm {...defaultProps} />
      );

      const inviteButton = screen.getByText('Invite Member');
      await user.click(inviteButton);

      // Form should now be visible
      expect(screen.getByPlaceholderText('colleague@example.com')).toBeInTheDocument();
      expect(screen.getByText('Send Invitation')).toBeInTheDocument();
    });

    it('shows role dropdown with all options', async () => {
      const user = userEvent.setup();

      renderWithQueryClient(
        <InviteMemberForm {...defaultProps} />
      );

      await user.click(screen.getByText('Invite Member'));

      // Check that all role options are available
      expect(screen.getByRole('option', { name: 'Admin' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Editor' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Publisher' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Viewer' })).toBeInTheDocument();
    });
  });

  describe('Invite Submission', () => {
    it('calls inviteMember with correct data', async () => {
      const user = userEvent.setup();
      mockInviteMember.mockResolvedValue({ id: 1 });

      renderWithQueryClient(
        <InviteMemberForm {...defaultProps} />
      );

      await user.click(screen.getByText('Invite Member'));

      const emailInput = screen.getByPlaceholderText('colleague@example.com');
      await user.type(emailInput, 'newuser@test.com');

      const roleSelect = screen.getByRole('combobox');
      await user.selectOptions(roleSelect, 'admin');

      const submitButton = screen.getByText('Send Invitation');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockInviteMember).toHaveBeenCalledWith(1, {
          email: 'newuser@test.com',
          role: 'admin',
          customMessage: undefined,
        });
      });
    });

    it('hides form after successful invitation', async () => {
      const user = userEvent.setup();
      mockInviteMember.mockResolvedValue({ id: 1 });

      renderWithQueryClient(
        <InviteMemberForm {...defaultProps} />
      );

      await user.click(screen.getByText('Invite Member'));

      const emailInput = screen.getByPlaceholderText('colleague@example.com');
      await user.type(emailInput, 'newuser@test.com');

      await user.click(screen.getByText('Send Invitation'));

      await waitFor(() => {
        // Form should be hidden again
        expect(screen.queryByPlaceholderText('colleague@example.com')).not.toBeInTheDocument();
      });
    });
  });

  describe('Pending Invites', () => {
    it('displays list of pending invitations', async () => {
      const mockInvites: OrganizationInvite[] = [
        {
          id: 1,
          organization_id: 1,
          email: 'pending1@test.com',
          role: 'editor',
          invited_by: 1,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        },
      ];
      mockListPendingInvites.mockResolvedValue(mockInvites);

      renderWithQueryClient(
        <InviteMemberForm {...defaultProps} />
      );

      await waitFor(() => {
        expect(screen.getByText('pending1@test.com')).toBeInTheDocument();
      });
    });

    it('shows pending invite count', async () => {
      const mockInvites: OrganizationInvite[] = [
        {
          id: 1,
          organization_id: 1,
          email: 'pending@test.com',
          role: 'editor',
          invited_by: 1,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        },
      ];
      mockListPendingInvites.mockResolvedValue(mockInvites);

      renderWithQueryClient(
        <InviteMemberForm {...defaultProps} />
      );

      await waitFor(() => {
        expect(screen.getByText('(1)')).toBeInTheDocument();
      });
    });

    it('shows "No pending invitations" when list is empty', async () => {
      mockListPendingInvites.mockResolvedValue([]);

      renderWithQueryClient(
        <InviteMemberForm {...defaultProps} />
      );

      await waitFor(() => {
        expect(screen.getByText('No pending invitations')).toBeInTheDocument();
      });
    });

    it('calls revokeInvite when X button is clicked', async () => {
      const user = userEvent.setup();
      const mockInvites: OrganizationInvite[] = [
        {
          id: 1,
          organization_id: 1,
          email: 'pending@test.com',
          role: 'editor',
          invited_by: 1,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        },
      ];
      mockListPendingInvites.mockResolvedValue(mockInvites);
      mockRevokeInvite.mockResolvedValue(undefined);

      // Mock window.confirm
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      renderWithQueryClient(
        <InviteMemberForm {...defaultProps} />
      );

      await waitFor(() => {
        expect(screen.getByText('pending@test.com')).toBeInTheDocument();
      });

      const revokeButton = screen.getByTitle('Revoke invitation');
      await user.click(revokeButton);

      await waitFor(() => {
        expect(mockRevokeInvite).toHaveBeenCalledWith(1, 1);
      });
    });
  });

  describe('Form Cancellation', () => {
    it('hides form when Cancel button is clicked', async () => {
      const user = userEvent.setup();

      renderWithQueryClient(
        <InviteMemberForm {...defaultProps} />
      );

      await user.click(screen.getByText('Invite Member'));
      expect(screen.getByPlaceholderText('colleague@example.com')).toBeInTheDocument();

      await user.click(screen.getByText('Cancel'));
      expect(screen.queryByPlaceholderText('colleague@example.com')).not.toBeInTheDocument();
    });
  });
});
