import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import {
  CurrentPlanCard,
  UsageOverview,
  UpgradeModal,
  InvoiceTable,
} from '../../components/billing';
import { billingService } from '../../services/billing';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

export default function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [invoicePage, setInvoicePage] = useState(1);
  const queryClient = useQueryClient();

  // Check for checkout success/cancel
  useEffect(() => {
    const checkoutStatus = searchParams.get('checkout');
    if (checkoutStatus === 'success') {
      toast.success('Subscription activated successfully!');
      // Refresh subscription data
      queryClient.invalidateQueries({ queryKey: ['billing-subscription'] });
      queryClient.invalidateQueries({ queryKey: ['billing-usage'] });
      // Clear the query param
      setSearchParams({});
    } else if (checkoutStatus === 'canceled') {
      toast.error('Checkout was canceled');
      setSearchParams({});
    }
  }, [searchParams, setSearchParams, queryClient]);

  // Fetch subscription data
  const {
    data: subscription,
    isLoading: isSubscriptionLoading,
    error: subscriptionError,
  } = useQuery({
    queryKey: ['billing-subscription'],
    queryFn: billingService.getSubscription,
    staleTime: 30000, // 30 seconds
  });

  // Fetch usage data
  const {
    data: usageData,
    isLoading: isUsageLoading,
    error: usageError,
  } = useQuery({
    queryKey: ['billing-usage'],
    queryFn: billingService.getUsage,
    staleTime: 30000,
  });

  // Fetch invoices
  const {
    data: invoicesData,
    isLoading: isInvoicesLoading,
  } = useQuery({
    queryKey: ['billing-invoices', invoicePage],
    queryFn: () => billingService.getInvoices(invoicePage, 10),
    staleTime: 60000, // 1 minute
  });

  // Fetch plans for upgrade modal
  const { data: plans } = useQuery({
    queryKey: ['billing-plans'],
    queryFn: billingService.getPlans,
    staleTime: 300000, // 5 minutes
  });

  // Portal URL mutation
  const portalMutation = useMutation({
    mutationFn: billingService.getPortalUrl,
    onSuccess: (url) => {
      window.location.href = url;
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to open billing portal');
    },
  });

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: ({ planTier, billingCycle }: { planTier: 'starter' | 'pro'; billingCycle: 'monthly' | 'annual' }) =>
      billingService.createCheckout({ plan_tier: planTier, billing_cycle: billingCycle }),
    onSuccess: (data) => {
      // Redirect to Stripe Checkout
      window.location.href = data.checkout_url;
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to start checkout');
    },
  });

  const handleUpgrade = async (planTier: 'starter' | 'pro', billingCycle: 'monthly' | 'annual') => {
    await checkoutMutation.mutateAsync({ planTier, billingCycle });
  };

  const handleManageBilling = () => {
    portalMutation.mutate(undefined);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['billing-subscription'] });
    queryClient.invalidateQueries({ queryKey: ['billing-usage'] });
    queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
    toast.success('Refreshing billing data...');
  };

  // Loading state
  if (isSubscriptionLoading || isUsageLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Error state
  if (subscriptionError || usageError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <h2 className="text-lg font-semibold text-red-800 mb-2">Failed to load billing data</h2>
        <p className="text-sm text-red-600 mb-4">
          {(subscriptionError as Error)?.message || (usageError as Error)?.message || 'An error occurred'}
        </p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
          <p className="text-gray-600">Manage your subscription and view usage</p>
        </div>
        <button
          onClick={handleRefresh}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Refresh data"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Plan Card */}
        {subscription && (
          <CurrentPlanCard
            subscription={subscription}
            onUpgradeClick={() => setShowUpgradeModal(true)}
            onManageBillingClick={handleManageBilling}
          />
        )}

        {/* Usage Overview */}
        {usageData && <UsageOverview usage={usageData.usage} />}
      </div>

      {/* Invoice History */}
      {invoicesData && (
        <InvoiceTable
          invoices={invoicesData.invoices}
          pagination={invoicesData.pagination}
          onPageChange={setInvoicePage}
          isLoading={isInvoicesLoading}
        />
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && plans && subscription && (
        <UpgradeModal
          plans={plans}
          currentPlanTier={subscription.plan_tier}
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={handleUpgrade}
          isLoading={checkoutMutation.isPending}
        />
      )}
    </div>
  );
}
