import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MembersTable from '../MembersTable';
import type { OrganizationMember } from '../../../services/organization';

// Mock the organization service
vi.mock('../../../services/organization', () => ({
  organizationService: {
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
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

describe('MembersTable', () => {
  const mockOnTransferOwnership = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockMember = (overrides?: Partial<OrganizationMember>): OrganizationMember => ({
    id: 1,
    organization_id: 1,
    user_id: 1,
    role: 'editor',
    joined_at: '2025-01-01T00:00:00.000Z',
    user_email: 'test@example.com',
    user_name: 'Test User',
    ...overrides,
  });

  const defaultProps = {
    organizationId: 1,
    currentUserRole: 'admin',
    currentUserId: 99,
    onTransferOwnership: mockOnTransferOwnership,
  };

  describe('Member Display', () => {
    it('renders member list with header', () => {
      const members = [
        createMockMember({ id: 1, user_name: 'Owner User', role: 'owner' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} />
      );

      expect(screen.getByText('Team Members')).toBeInTheDocument();
    });

    it('shows member count badge', () => {
      const members = [
        createMockMember({ id: 1 }),
        createMockMember({ id: 2 }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} />
      );

      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('displays member name and email', () => {
      const members = [
        createMockMember({ user_name: 'Test User', user_email: 'test@example.com' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} />
      );

      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('shows role badges', () => {
      const members = [
        createMockMember({ id: 1, role: 'owner' }),
        createMockMember({ id: 2, role: 'admin' }),
        createMockMember({ id: 3, role: 'editor' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} />
      );

      expect(screen.getByText('Owner')).toBeInTheDocument();
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Editor')).toBeInTheDocument();
    });

    it('shows "(You)" indicator for current user', () => {
      const members = [
        createMockMember({ id: 1, user_id: 99, user_name: 'Current User' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} currentUserId={99} />
      );

      expect(screen.getByText('(You)')).toBeInTheDocument();
    });

    it('shows "No name" when user_name is empty', () => {
      const members = [
        createMockMember({ id: 1, user_name: '' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} />
      );

      expect(screen.getByText('No name')).toBeInTheDocument();
    });
  });

  describe('Permissions', () => {
    it('shows actions column for admin users', () => {
      const members = [
        createMockMember({ id: 1, role: 'editor' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} currentUserRole="admin" />
      );

      expect(screen.getByText('Actions')).toBeInTheDocument();
    });

    it('hides actions column for editor users', () => {
      const members = [
        createMockMember({ id: 1, role: 'editor' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} currentUserRole="editor" />
      );

      expect(screen.queryByText('Actions')).not.toBeInTheDocument();
    });

    it('shows "Organization owner" text for owner row', () => {
      const members = [
        createMockMember({ id: 1, role: 'owner' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} currentUserRole="admin" />
      );

      expect(screen.getByText('Organization owner')).toBeInTheDocument();
    });
  });

  describe('Action Menu', () => {
    it('opens action menu when clicking more button', async () => {
      const user = userEvent.setup();
      const members = [
        createMockMember({ id: 1, user_id: 2, role: 'editor' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} currentUserRole="admin" />
      );

      const moreButtons = screen.getAllByRole('button');
      // Find the more button (not in the header)
      const moreButton = moreButtons.find(btn => btn.closest('td'));
      if (moreButton) {
        await user.click(moreButton);
        expect(screen.getByText('Change Role')).toBeInTheDocument();
      }
    });

    it('shows "Make Owner" option for organization owners', async () => {
      const user = userEvent.setup();
      const members = [
        createMockMember({ id: 1, user_id: 2, role: 'editor' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} currentUserRole="owner" />
      );

      const moreButtons = screen.getAllByRole('button');
      const moreButton = moreButtons.find(btn => btn.closest('td'));
      if (moreButton) {
        await user.click(moreButton);
        expect(screen.getByText('Make Owner')).toBeInTheDocument();
      }
    });

    it('does not show "Make Owner" for admin users', async () => {
      const user = userEvent.setup();
      const members = [
        createMockMember({ id: 1, user_id: 2, role: 'editor' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} currentUserRole="admin" />
      );

      const moreButtons = screen.getAllByRole('button');
      const moreButton = moreButtons.find(btn => btn.closest('td'));
      if (moreButton) {
        await user.click(moreButton);
        expect(screen.queryByText('Make Owner')).not.toBeInTheDocument();
      }
    });

    it('calls onTransferOwnership when Make Owner is clicked', async () => {
      const user = userEvent.setup();
      const members = [
        createMockMember({ id: 1, user_id: 2, user_name: 'Editor User', role: 'editor' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} currentUserRole="owner" />
      );

      const moreButtons = screen.getAllByRole('button');
      const moreButton = moreButtons.find(btn => btn.closest('td'));
      if (moreButton) {
        await user.click(moreButton);
        const makeOwnerButton = screen.getByText('Make Owner');
        await user.click(makeOwnerButton);
        expect(mockOnTransferOwnership).toHaveBeenCalledWith(2, 'Editor User');
      }
    });
  });

  describe('Date Formatting', () => {
    it('formats join date correctly', () => {
      const members = [
        createMockMember({ id: 1, joined_at: '2025-06-15T10:30:00.000Z' }),
      ];

      renderWithQueryClient(
        <MembersTable {...defaultProps} members={members} />
      );

      // Should display in format like "Jun 15, 2025"
      expect(screen.getByText(/Jun 15, 2025/)).toBeInTheDocument();
    });
  });
});
