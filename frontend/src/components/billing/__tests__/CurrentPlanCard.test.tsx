import { describe, it, vi, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CurrentPlanCard from '../CurrentPlanCard';
import type { SubscriptionData } from '../../../services/billing';

describe('CurrentPlanCard', () => {
  const mockOnUpgradeClick = vi.fn();
  const mockOnManageBillingClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockSubscription = (overrides?: Partial<SubscriptionData>): SubscriptionData => ({
    has_subscription: true,
    plan_tier: 'starter',
    plan_name: 'Starter',
    billing_cycle: 'monthly',
    status: 'active',
    current_period_start: '2025-01-01T00:00:00.000Z',
    current_period_end: '2025-02-01T00:00:00.000Z',
    cancel_at_period_end: false,
    canceled_at: null,
    amount_cents: 2900,
    price_display: '$29/month',
    organization_name: 'Test Organization',
    ...overrides,
  });

  describe('Plan Display', () => {
    it('renders current plan information', () => {
      const subscription = createMockSubscription();

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.getByText('Current Plan')).toBeInTheDocument();
      expect(screen.getByText('Test Organization')).toBeInTheDocument();
      expect(screen.getByText('Starter')).toBeInTheDocument();
      expect(screen.getByText('$29/month')).toBeInTheDocument();
      expect(screen.getByText('Monthly billing')).toBeInTheDocument();
    });

    it('shows annual billing label when on annual cycle', () => {
      const subscription = createMockSubscription({
        billing_cycle: 'annual',
        price_display: '$290/year',
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.getByText('Annual billing')).toBeInTheDocument();
      expect(screen.getByText('Save 17% with annual')).toBeInTheDocument();
    });

    it('shows Active status badge', () => {
      const subscription = createMockSubscription({ status: 'active' });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('shows Trialing status badge', () => {
      const subscription = createMockSubscription({ status: 'trialing' });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.getByText('Trialing')).toBeInTheDocument();
    });
  });

  describe('Free Plan', () => {
    it('shows Free price display for free tier', () => {
      const subscription = createMockSubscription({
        has_subscription: false,
        plan_tier: 'free',
        plan_name: 'Free',
        price_display: 'Free',
        amount_cents: 0,
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      // Free appears for both plan_name and price_display
      const freeElements = screen.getAllByText('Free');
      expect(freeElements.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Upgrade Plan')).toBeInTheDocument();
    });

    it('does not show Manage Billing button for free tier', () => {
      const subscription = createMockSubscription({
        has_subscription: false,
        plan_tier: 'free',
        plan_name: 'Free',
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.queryByText('Manage Billing')).not.toBeInTheDocument();
    });
  });

  describe('Manage Billing Button', () => {
    it('shows Manage Billing button for paid plans', () => {
      const subscription = createMockSubscription();

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.getByText('Manage Billing')).toBeInTheDocument();
    });

    it('calls onManageBillingClick when Manage Billing button is clicked', async () => {
      const user = userEvent.setup();
      const subscription = createMockSubscription();

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      const manageBillingButton = screen.getByText('Manage Billing');
      await user.click(manageBillingButton);

      expect(mockOnManageBillingClick).toHaveBeenCalledTimes(1);
    });

    it('shows Manage Billing button for all paid tiers (starter)', async () => {
      const subscription = createMockSubscription({ plan_tier: 'starter' });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.getByText('Manage Billing')).toBeInTheDocument();
    });

    it('shows Manage Billing button for all paid tiers (pro)', async () => {
      const subscription = createMockSubscription({
        plan_tier: 'pro',
        plan_name: 'Pro',
        price_display: '$99/month',
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.getByText('Manage Billing')).toBeInTheDocument();
    });

    it('shows Manage Billing button for enterprise tier', async () => {
      const subscription = createMockSubscription({
        plan_tier: 'enterprise',
        plan_name: 'Enterprise',
        price_display: 'Custom',
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.getByText('Manage Billing')).toBeInTheDocument();
    });
  });

  describe('Upgrade Button', () => {
    it('shows Upgrade Plan button for free tier', () => {
      const subscription = createMockSubscription({
        has_subscription: false,
        plan_tier: 'free',
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.getByText('Upgrade Plan')).toBeInTheDocument();
    });

    it('shows Change Plan button for paid non-enterprise tiers', () => {
      const subscription = createMockSubscription({ plan_tier: 'starter' });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.getByText('Change Plan')).toBeInTheDocument();
    });

    it('calls onUpgradeClick when Upgrade/Change Plan button is clicked', async () => {
      const user = userEvent.setup();
      const subscription = createMockSubscription();

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      const changePlanButton = screen.getByText('Change Plan');
      await user.click(changePlanButton);

      expect(mockOnUpgradeClick).toHaveBeenCalledTimes(1);
    });

    it('does not show upgrade button for enterprise tier', () => {
      const subscription = createMockSubscription({
        plan_tier: 'enterprise',
        plan_name: 'Enterprise',
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.queryByText('Change Plan')).not.toBeInTheDocument();
      expect(screen.queryByText('Upgrade Plan')).not.toBeInTheDocument();
    });
  });

  describe('Warning States', () => {
    it('shows past due warning message', () => {
      const subscription = createMockSubscription({ status: 'past_due' });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(
        screen.getByText(/your payment is past due/i)
      ).toBeInTheDocument();
    });

    it('shows cancellation warning when subscription will cancel', () => {
      const subscription = createMockSubscription({
        cancel_at_period_end: true,
        current_period_end: '2025-02-01T00:00:00.000Z',
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(
        screen.getByText(/your subscription will be canceled/i)
      ).toBeInTheDocument();
    });

    it('shows trial ending message when trialing', () => {
      const subscription = createMockSubscription({
        status: 'trialing',
        current_period_end: '2025-02-01T00:00:00.000Z',
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.getByText(/trial ends on/i)).toBeInTheDocument();
    });
  });

  describe('Billing Period', () => {
    it('shows next billing date for active subscriptions', () => {
      const subscription = createMockSubscription({
        status: 'active',
        current_period_end: '2025-02-01T00:00:00.000Z',
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      expect(screen.getByText(/next billing date/i)).toBeInTheDocument();
    });

    it('shows ends date when subscription is canceling', () => {
      const subscription = createMockSubscription({
        cancel_at_period_end: true,
        current_period_end: '2025-02-01T00:00:00.000Z',
      });

      render(
        <CurrentPlanCard
          subscription={subscription}
          onUpgradeClick={mockOnUpgradeClick}
          onManageBillingClick={mockOnManageBillingClick}
        />
      );

      // The card shows "Ends" instead of "Next billing date" when canceling
      const periodInfo = screen.getByText(/ends/i);
      expect(periodInfo).toBeInTheDocument();
    });
  });
});
