import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpgradeModal from '../UpgradeModal';
import type { Plan } from '../../../services/billing';

const mockPlans: Plan[] = [
  {
    tier: 'free',
    name: 'Free',
    description: 'Perfect for getting started',
    price_monthly: 0,
    price_annual: 0,
    features: ['1 Site', '100 Posts'],
    quotas: { sites: 1, posts: 100, users: 1, storage_bytes: 1073741824, api_calls: 10000 },
    is_popular: false,
  },
  {
    tier: 'starter',
    name: 'Starter',
    description: 'For small teams',
    price_monthly: 29,
    price_annual: 290,
    features: ['3 Sites', '1,000 Posts', '5 Team Members'],
    quotas: { sites: 3, posts: 1000, users: 5, storage_bytes: 10737418240, api_calls: 100000 },
    is_popular: true,
  },
  {
    tier: 'pro',
    name: 'Pro',
    description: 'For larger teams',
    price_monthly: 99,
    price_annual: 990,
    features: ['10 Sites', '10,000 Posts', '25 Team Members'],
    quotas: { sites: 10, posts: 10000, users: 25, storage_bytes: 107374182400, api_calls: 1000000 },
    is_popular: false,
  },
  {
    tier: 'enterprise',
    name: 'Enterprise',
    description: 'For organizations',
    price_monthly: null,
    price_annual: null,
    features: ['Unlimited Sites'],
    quotas: { sites: -1, posts: -1, users: -1, storage_bytes: -1, api_calls: -1 },
    is_popular: false,
    contact_sales: true,
  },
];

describe('UpgradeModal', () => {
  const mockOnClose = vi.fn();
  const mockOnUpgrade = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with plans', () => {
    render(
      <UpgradeModal
        plans={mockPlans}
        currentPlanTier="free"
        onClose={mockOnClose}
        onUpgrade={mockOnUpgrade}
        isLoading={false}
      />
    );

    expect(screen.getByText('Choose Your Plan')).toBeInTheDocument();
    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Pro')).toBeInTheDocument();
  });

  it('shows Most Popular badge on starter plan', () => {
    render(
      <UpgradeModal
        plans={mockPlans}
        currentPlanTier="free"
        onClose={mockOnClose}
        onUpgrade={mockOnUpgrade}
        isLoading={false}
      />
    );

    expect(screen.getByText('Most Popular')).toBeInTheDocument();
  });

  it('toggles between monthly and annual billing', async () => {
    const user = userEvent.setup();

    render(
      <UpgradeModal
        plans={mockPlans}
        currentPlanTier="free"
        onClose={mockOnClose}
        onUpgrade={mockOnUpgrade}
        isLoading={false}
      />
    );

    // Default is annual
    expect(screen.getByText('$290')).toBeInTheDocument();

    // Click monthly
    await user.click(screen.getByText('Monthly'));
    expect(screen.getByText('$29')).toBeInTheDocument();

    // Click annual again
    await user.click(screen.getByText('Annual'));
    expect(screen.getByText('$290')).toBeInTheDocument();
  });

  it('calls onUpgrade with correct parameters', async () => {
    const user = userEvent.setup();

    render(
      <UpgradeModal
        plans={mockPlans}
        currentPlanTier="free"
        onClose={mockOnClose}
        onUpgrade={mockOnUpgrade}
        isLoading={false}
      />
    );

    // Click on Starter plan upgrade button
    const upgradeButtons = screen.getAllByRole('button', { name: /get started to starter/i });
    await user.click(upgradeButtons[0]);

    await waitFor(() => {
      expect(mockOnUpgrade).toHaveBeenCalledWith('starter', 'annual');
    });
  });

  it('shows loading state during upgrade', () => {
    render(
      <UpgradeModal
        plans={mockPlans}
        currentPlanTier="free"
        onClose={mockOnClose}
        onUpgrade={mockOnUpgrade}
        isLoading={true}
      />
    );

    // Loading buttons should be disabled
    const upgradeButtons = screen.getAllByRole('button', { name: /get started/i });
    upgradeButtons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  it('shows Current Plan for current tier', () => {
    render(
      <UpgradeModal
        plans={mockPlans}
        currentPlanTier="starter"
        onClose={mockOnClose}
        onUpgrade={mockOnUpgrade}
        isLoading={false}
      />
    );

    expect(screen.getByText('Current Plan')).toBeInTheDocument();
  });

  it('closes modal when X button is clicked', async () => {
    const user = userEvent.setup();

    render(
      <UpgradeModal
        plans={mockPlans}
        currentPlanTier="free"
        onClose={mockOnClose}
        onUpgrade={mockOnUpgrade}
        isLoading={false}
      />
    );

    // Find the close button (X icon)
    const closeButton = screen.getByRole('button', { name: '' });
    await user.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows enterprise contact sales section', () => {
    render(
      <UpgradeModal
        plans={mockPlans}
        currentPlanTier="free"
        onClose={mockOnClose}
        onUpgrade={mockOnUpgrade}
        isLoading={false}
      />
    );

    expect(screen.getByText('Need more?')).toBeInTheDocument();
    expect(screen.getByText('Contact Sales')).toBeInTheDocument();
  });

  it('shows save 17% badge on annual billing', () => {
    render(
      <UpgradeModal
        plans={mockPlans}
        currentPlanTier="free"
        onClose={mockOnClose}
        onUpgrade={mockOnUpgrade}
        isLoading={false}
      />
    );

    expect(screen.getByText('Save 17%')).toBeInTheDocument();
  });

  it('displays plan features', () => {
    render(
      <UpgradeModal
        plans={mockPlans}
        currentPlanTier="free"
        onClose={mockOnClose}
        onUpgrade={mockOnUpgrade}
        isLoading={false}
      />
    );

    expect(screen.getByText('3 Sites')).toBeInTheDocument();
    expect(screen.getByText('1,000 Posts')).toBeInTheDocument();
    expect(screen.getByText('5 Team Members')).toBeInTheDocument();
  });
});
