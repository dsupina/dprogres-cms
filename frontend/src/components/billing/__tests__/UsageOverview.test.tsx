import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsageOverview from '../UsageOverview';
import type { UsageItem } from '../../../services/billing';

describe('UsageOverview', () => {
  const mockOnUpgradeClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockUsageItem = (overrides?: Partial<UsageItem>): UsageItem => ({
    dimension: 'sites',
    label: 'Sites',
    current: 2,
    limit: 3,
    remaining: 1,
    percentage: 66.67,
    current_display: '2',
    limit_display: '3',
    is_unlimited: false,
    is_warning: false,
    is_critical: false,
    ...overrides,
  });

  const createMockUsageData = (): UsageItem[] => [
    createMockUsageItem({
      dimension: 'sites',
      label: 'Sites',
      current: 2,
      limit: 3,
      remaining: 1,
      percentage: 66.67,
      current_display: '2',
      limit_display: '3',
    }),
    createMockUsageItem({
      dimension: 'posts',
      label: 'Posts',
      current: 50,
      limit: 100,
      remaining: 50,
      percentage: 50,
      current_display: '50',
      limit_display: '100',
    }),
    createMockUsageItem({
      dimension: 'users',
      label: 'Team Members',
      current: 3,
      limit: 5,
      remaining: 2,
      percentage: 60,
      current_display: '3',
      limit_display: '5',
    }),
    createMockUsageItem({
      dimension: 'storage_bytes',
      label: 'Storage',
      current: 500000000,
      limit: 1073741824,
      remaining: 573741824,
      percentage: 46.57,
      current_display: '500 MB',
      limit_display: '1 GB',
    }),
    createMockUsageItem({
      dimension: 'api_calls',
      label: 'API Calls',
      current: 5000,
      limit: 10000,
      remaining: 5000,
      percentage: 50,
      current_display: '5,000',
      limit_display: '10,000',
    }),
  ];

  describe('Basic Rendering', () => {
    it('renders all 5 quota dimensions', () => {
      const usage = createMockUsageData();

      render(<UsageOverview usage={usage} />);

      expect(screen.getByText('Usage Overview')).toBeInTheDocument();
      expect(screen.getByText('Sites')).toBeInTheDocument();
      expect(screen.getByText('Posts')).toBeInTheDocument();
      expect(screen.getByText('Team Members')).toBeInTheDocument();
      expect(screen.getByText('Storage')).toBeInTheDocument();
      expect(screen.getByText('API Calls')).toBeInTheDocument();
    });

    it('displays current and limit values for each dimension', () => {
      const usage = createMockUsageData();

      render(<UsageOverview usage={usage} />);

      expect(screen.getByText('2 / 3')).toBeInTheDocument();
      expect(screen.getByText('50 / 100')).toBeInTheDocument();
      expect(screen.getByText('3 / 5')).toBeInTheDocument();
      expect(screen.getByText('500 MB / 1 GB')).toBeInTheDocument();
      expect(screen.getByText('5,000 / 10,000')).toBeInTheDocument();
    });

    it('displays percentage labels for each dimension', () => {
      const usage = [
        createMockUsageItem({ percentage: 67 }),
        createMockUsageItem({ dimension: 'posts', label: 'Posts', percentage: 50 }),
      ];

      render(<UsageOverview usage={usage} />);

      expect(screen.getByText('67%')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('displays summary footer message', () => {
      const usage = createMockUsageData();

      render(<UsageOverview usage={usage} />);

      expect(
        screen.getByText(/usage resets monthly for api calls/i)
      ).toBeInTheDocument();
    });

    it('renders data-testid attributes for each quota item', () => {
      const usage = createMockUsageData();

      render(<UsageOverview usage={usage} />);

      expect(screen.getByTestId('quota-item-sites')).toBeInTheDocument();
      expect(screen.getByTestId('quota-item-posts')).toBeInTheDocument();
      expect(screen.getByTestId('quota-item-users')).toBeInTheDocument();
      expect(screen.getByTestId('quota-item-storage_bytes')).toBeInTheDocument();
      expect(screen.getByTestId('quota-item-api_calls')).toBeInTheDocument();
    });
  });

  describe('Progress Bar Colors', () => {
    it('shows blue/default color for normal usage (<80%)', () => {
      const usage = [
        createMockUsageItem({
          percentage: 50,
          is_warning: false,
          is_critical: false,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      const progressBar = screen.getByTestId('progress-bar-sites');
      expect(progressBar).toHaveClass('bg-blue-500');
    });

    it('shows yellow color for warning state (80-94%)', () => {
      const usage = [
        createMockUsageItem({
          percentage: 85,
          is_warning: true,
          is_critical: false,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      const progressBar = screen.getByTestId('progress-bar-sites');
      expect(progressBar).toHaveClass('bg-yellow-500');
    });

    it('shows red color for critical state (95%+)', () => {
      const usage = [
        createMockUsageItem({
          percentage: 98,
          is_warning: true,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      const progressBar = screen.getByTestId('progress-bar-sites');
      expect(progressBar).toHaveClass('bg-red-500');
    });

    it('caps progress bar width at 100%', () => {
      const usage = [
        createMockUsageItem({
          percentage: 150,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      const progressBar = screen.getByTestId('progress-bar-sites');
      expect(progressBar).toHaveStyle({ width: '100%' });
    });
  });

  describe('Unlimited Quotas', () => {
    it('displays "Unlimited" for unlimited dimensions', () => {
      const usage = [
        createMockUsageItem({
          is_unlimited: true,
          limit_display: 'Unlimited',
          percentage: 0,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      expect(screen.getByText('Unlimited')).toBeInTheDocument();
    });

    it('does not show progress bar for unlimited dimensions', () => {
      const usage = [
        createMockUsageItem({
          is_unlimited: true,
          percentage: 0,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      // Should have gradient background instead of progress bar
      expect(screen.queryByTestId('progress-bar-sites')).not.toBeInTheDocument();
    });

    it('does not show warning messages for unlimited dimensions', () => {
      const usage = [
        createMockUsageItem({
          is_unlimited: true,
          is_warning: true,
          is_critical: true,
          percentage: 100,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      expect(screen.queryByText(/critical/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/warning/i)).not.toBeInTheDocument();
    });
  });

  describe('Warning Messages', () => {
    it('shows warning message for 80-94% usage', () => {
      const usage = [
        createMockUsageItem({
          percentage: 85,
          is_warning: true,
          is_critical: false,
          remaining: 15,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      expect(screen.getByText(/warning: approaching limit/i)).toBeInTheDocument();
      expect(screen.getByText(/15 remaining/i)).toBeInTheDocument();
    });

    it('shows critical message for 95%+ usage', () => {
      const usage = [
        createMockUsageItem({
          label: 'Sites',
          percentage: 97,
          is_warning: true,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      expect(screen.getByText(/critical: you've used 97% of your sites/i)).toBeInTheDocument();
    });

    it('does not show warning when usage is normal (<80%)', () => {
      const usage = [
        createMockUsageItem({
          percentage: 50,
          is_warning: false,
          is_critical: false,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      expect(screen.queryByText(/warning/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/critical/i)).not.toBeInTheDocument();
    });
  });

  describe('Exceeded State (100%+)', () => {
    it('shows exceeded message when quota is at 100%', () => {
      const usage = [
        createMockUsageItem({
          label: 'Sites',
          percentage: 100,
          remaining: 0,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      expect(screen.getByText(/quota exceeded/i)).toBeInTheDocument();
      expect(screen.getByText(/upgrade to continue using sites/i)).toBeInTheDocument();
    });

    it('shows exceeded message when quota exceeds 100%', () => {
      const usage = [
        createMockUsageItem({
          label: 'Posts',
          percentage: 120,
          remaining: -20,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      expect(screen.getByText(/quota exceeded/i)).toBeInTheDocument();
    });

    it('shows inline upgrade button for exceeded dimension', () => {
      const usage = [
        createMockUsageItem({
          dimension: 'posts',
          percentage: 100,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      expect(screen.getByTestId('upgrade-cta-posts')).toBeInTheDocument();
    });

    it('does not show exceeded message when no onUpgradeClick handler', () => {
      const usage = [
        createMockUsageItem({
          percentage: 100,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      expect(screen.queryByText(/quota exceeded/i)).not.toBeInTheDocument();
    });
  });

  describe('Upgrade CTA Buttons', () => {
    it('shows header upgrade button when any quota is exceeded', () => {
      const usage = [
        createMockUsageItem({
          dimension: 'sites',
          percentage: 100,
          is_critical: true,
        }),
        createMockUsageItem({
          dimension: 'posts',
          percentage: 50,
        }),
      ];

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      expect(screen.getByTestId('upgrade-cta-header')).toBeInTheDocument();
      expect(screen.getByText('Upgrade Now')).toBeInTheDocument();
    });

    it('shows footer upgrade link when quota is in warning but not exceeded', () => {
      const usage = [
        createMockUsageItem({
          percentage: 85,
          is_warning: true,
          is_critical: false,
        }),
      ];

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      expect(screen.getByTestId('upgrade-cta-footer')).toBeInTheDocument();
      expect(screen.getByText('Upgrade for more resources')).toBeInTheDocument();
    });

    it('does not show footer upgrade link when quota is exceeded (header button shown instead)', () => {
      const usage = [
        createMockUsageItem({
          percentage: 100,
          is_warning: true,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      expect(screen.getByTestId('upgrade-cta-header')).toBeInTheDocument();
      expect(screen.queryByTestId('upgrade-cta-footer')).not.toBeInTheDocument();
    });

    it('does not show upgrade buttons when no onUpgradeClick handler', () => {
      const usage = [
        createMockUsageItem({
          percentage: 100,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      expect(screen.queryByTestId('upgrade-cta-header')).not.toBeInTheDocument();
      expect(screen.queryByTestId('upgrade-cta-footer')).not.toBeInTheDocument();
    });

    it('does not show upgrade buttons when all quotas are normal', () => {
      const usage = createMockUsageData();

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      expect(screen.queryByTestId('upgrade-cta-header')).not.toBeInTheDocument();
      expect(screen.queryByTestId('upgrade-cta-footer')).not.toBeInTheDocument();
    });

    it('calls onUpgradeClick when header upgrade button is clicked', async () => {
      const user = userEvent.setup();
      const usage = [
        createMockUsageItem({
          percentage: 100,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      await user.click(screen.getByTestId('upgrade-cta-header'));

      expect(mockOnUpgradeClick).toHaveBeenCalledTimes(1);
    });

    it('calls onUpgradeClick when inline upgrade button is clicked', async () => {
      const user = userEvent.setup();
      const usage = [
        createMockUsageItem({
          dimension: 'posts',
          percentage: 100,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      await user.click(screen.getByTestId('upgrade-cta-posts'));

      expect(mockOnUpgradeClick).toHaveBeenCalledTimes(1);
    });

    it('calls onUpgradeClick when footer upgrade link is clicked', async () => {
      const user = userEvent.setup();
      const usage = [
        createMockUsageItem({
          percentage: 85,
          is_warning: true,
        }),
      ];

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      await user.click(screen.getByTestId('upgrade-cta-footer'));

      expect(mockOnUpgradeClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('Dimension Icons', () => {
    it('renders correct icons for each dimension', () => {
      const usage = createMockUsageData();

      render(<UsageOverview usage={usage} />);

      // Each dimension should have its icon container
      expect(screen.getByTestId('quota-item-sites')).toBeInTheDocument();
      expect(screen.getByTestId('quota-item-posts')).toBeInTheDocument();
      expect(screen.getByTestId('quota-item-users')).toBeInTheDocument();
      expect(screen.getByTestId('quota-item-storage_bytes')).toBeInTheDocument();
      expect(screen.getByTestId('quota-item-api_calls')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty usage array', () => {
      render(<UsageOverview usage={[]} />);

      expect(screen.getByText('Usage Overview')).toBeInTheDocument();
      expect(
        screen.getByText(/usage resets monthly for api calls/i)
      ).toBeInTheDocument();
    });

    it('handles single usage item', () => {
      const usage = [createMockUsageItem()];

      render(<UsageOverview usage={usage} />);

      expect(screen.getByText('Sites')).toBeInTheDocument();
      expect(screen.queryByText('Posts')).not.toBeInTheDocument();
    });

    it('handles unknown dimension gracefully', () => {
      const usage = [
        createMockUsageItem({
          dimension: 'unknown_dimension',
          label: 'Unknown',
        }),
      ];

      render(<UsageOverview usage={usage} />);

      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });

    it('rounds percentage to nearest integer for display', () => {
      const usage = [
        createMockUsageItem({
          percentage: 66.67,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      expect(screen.getByText('67%')).toBeInTheDocument();
    });

    it('formats remaining count with locale string for warnings', () => {
      const usage = [
        createMockUsageItem({
          percentage: 85,
          is_warning: true,
          remaining: 1500,
        }),
      ];

      render(<UsageOverview usage={usage} />);

      // toLocaleString formats differently based on locale, so check for either format
      const warningText = screen.getByText(/warning: approaching limit/i);
      expect(warningText).toBeInTheDocument();
      expect(warningText.textContent).toMatch(/1[,.]?500 remaining/i);
    });
  });

  describe('Multiple Exceeded Quotas', () => {
    it('shows header upgrade button when multiple quotas are exceeded', () => {
      const usage = [
        createMockUsageItem({
          dimension: 'sites',
          label: 'Sites',
          percentage: 100,
          is_critical: true,
        }),
        createMockUsageItem({
          dimension: 'posts',
          label: 'Posts',
          percentage: 105,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      // Should have one header button
      expect(screen.getByTestId('upgrade-cta-header')).toBeInTheDocument();
      // Should have inline buttons for each exceeded dimension
      expect(screen.getByTestId('upgrade-cta-sites')).toBeInTheDocument();
      expect(screen.getByTestId('upgrade-cta-posts')).toBeInTheDocument();
    });

    it('shows multiple exceeded messages for multiple exceeded quotas', () => {
      const usage = [
        createMockUsageItem({
          dimension: 'sites',
          label: 'Sites',
          percentage: 100,
          is_critical: true,
        }),
        createMockUsageItem({
          dimension: 'posts',
          label: 'Posts',
          percentage: 100,
          is_critical: true,
        }),
      ];

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      const exceededMessages = screen.getAllByText(/quota exceeded/i);
      expect(exceededMessages).toHaveLength(2);
    });
  });

  describe('Mixed States', () => {
    it('correctly displays items with different states', () => {
      const usage = [
        createMockUsageItem({
          dimension: 'sites',
          label: 'Sites',
          percentage: 50,
          is_warning: false,
          is_critical: false,
        }),
        createMockUsageItem({
          dimension: 'posts',
          label: 'Posts',
          percentage: 85,
          is_warning: true,
          is_critical: false,
          remaining: 150,
        }),
        createMockUsageItem({
          dimension: 'users',
          label: 'Team Members',
          percentage: 97,
          is_warning: true,
          is_critical: true,
        }),
        createMockUsageItem({
          dimension: 'storage_bytes',
          label: 'Storage',
          percentage: 100,
          is_warning: true,
          is_critical: true,
        }),
        createMockUsageItem({
          dimension: 'api_calls',
          label: 'API Calls',
          is_unlimited: true,
          percentage: 0,
        }),
      ];

      render(<UsageOverview usage={usage} onUpgradeClick={mockOnUpgradeClick} />);

      // Normal state - no message
      expect(screen.queryByText(/50%.*sites/i)).not.toBeInTheDocument();

      // Warning state - warning message
      expect(screen.getByText(/warning: approaching limit/i)).toBeInTheDocument();
      expect(screen.getByText(/150 remaining/i)).toBeInTheDocument();

      // Critical state (not exceeded) - critical message
      expect(screen.getByText(/critical: you've used 97% of your team members/i)).toBeInTheDocument();

      // Exceeded state - exceeded message
      expect(screen.getByText(/upgrade to continue using storage/i)).toBeInTheDocument();

      // Unlimited - shows "Unlimited"
      expect(screen.getByText('Unlimited')).toBeInTheDocument();
    });
  });
});
