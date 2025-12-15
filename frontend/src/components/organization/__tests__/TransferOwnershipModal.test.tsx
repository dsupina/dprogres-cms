import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import TransferOwnershipModal from '../TransferOwnershipModal';
import { organizationService } from '../../../services/organization';

// Mock the organization service
vi.mock('../../../services/organization', () => ({
  organizationService: {
    transferOwnership: vi.fn(),
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

describe('TransferOwnershipModal', () => {
  const mockOnClose = vi.fn();
  const mockTransferOwnership = organizationService.transferOwnership as ReturnType<typeof vi.fn>;

  const defaultProps = {
    organizationId: 1,
    organizationName: 'Test Organization',
    newOwnerId: 2,
    newOwnerName: 'New Owner User',
    onClose: mockOnClose,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Modal Display', () => {
    it('renders modal with correct title', () => {
      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      // Title and button both have this text, so check multiple elements exist
      const elements = screen.getAllByText('Transfer Ownership');
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    it('shows new owner name in details', () => {
      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      expect(screen.getByText('New Owner User')).toBeInTheDocument();
    });

    it('shows organization name in details', () => {
      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      expect(screen.getByText('Test Organization')).toBeInTheDocument();
    });

    it('shows warning about the action being irreversible', () => {
      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      expect(screen.getByText('This action cannot be undone')).toBeInTheDocument();
    });

    it('shows confirmation input requirement', () => {
      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      expect(screen.getByText('TRANSFER')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('TRANSFER')).toBeInTheDocument();
    });
  });

  describe('Cancel Button', () => {
    it('calls onClose when Cancel button is clicked', async () => {
      const user = userEvent.setup();

      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      const cancelButton = screen.getByText('Cancel');
      await user.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Confirmation Requirement', () => {
    it('disables Transfer button when confirmation text is empty', () => {
      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      const transferButton = screen.getByRole('button', { name: /Transfer Ownership/i });
      expect(transferButton).toBeDisabled();
    });

    it('disables Transfer button when confirmation text is incorrect', async () => {
      const user = userEvent.setup();

      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      const input = screen.getByPlaceholderText('TRANSFER');
      await user.type(input, 'wrong');

      const transferButton = screen.getByRole('button', { name: /Transfer Ownership/i });
      expect(transferButton).toBeDisabled();
    });

    it('enables Transfer button when TRANSFER is typed', async () => {
      const user = userEvent.setup();

      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      const input = screen.getByPlaceholderText('TRANSFER');
      await user.type(input, 'TRANSFER');

      const transferButton = screen.getByRole('button', { name: /Transfer Ownership/i });
      expect(transferButton).not.toBeDisabled();
    });

    it('auto-capitalizes input', async () => {
      const user = userEvent.setup();

      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      const input = screen.getByPlaceholderText('TRANSFER');
      await user.type(input, 'transfer');

      // Input should auto-capitalize, enabling the button
      const transferButton = screen.getByRole('button', { name: /Transfer Ownership/i });
      expect(transferButton).not.toBeDisabled();
    });
  });

  describe('Transfer Action', () => {
    it('calls transferOwnership when Transfer button is clicked', async () => {
      const user = userEvent.setup();
      mockTransferOwnership.mockResolvedValue(undefined);

      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      const input = screen.getByPlaceholderText('TRANSFER');
      await user.type(input, 'TRANSFER');

      const transferButton = screen.getByRole('button', { name: /Transfer Ownership/i });
      await user.click(transferButton);

      await waitFor(() => {
        expect(mockTransferOwnership).toHaveBeenCalledWith(1, { newOwnerId: 2 });
      });
    });

    it('calls onClose after successful transfer', async () => {
      const user = userEvent.setup();
      mockTransferOwnership.mockResolvedValue(undefined);

      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      const input = screen.getByPlaceholderText('TRANSFER');
      await user.type(input, 'TRANSFER');

      const transferButton = screen.getByRole('button', { name: /Transfer Ownership/i });
      await user.click(transferButton);

      await waitFor(() => {
        expect(mockOnClose).toHaveBeenCalled();
      });
    });
  });

  describe('What Will Change List', () => {
    it('shows what will change after transfer', () => {
      renderWithQueryClient(
        <TransferOwnershipModal {...defaultProps} />
      );

      expect(screen.getByText('What will change:')).toBeInTheDocument();
      expect(screen.getByText(/will have full control of organization settings/)).toBeInTheDocument();
      expect(screen.getByText(/will manage billing and subscriptions/)).toBeInTheDocument();
      expect(screen.getByText(/You will retain admin access/)).toBeInTheDocument();
    });
  });
});
