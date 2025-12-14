import { CreditCard, Calendar, Clock, AlertTriangle } from 'lucide-react';
import type { SubscriptionData } from '../../services/billing';
import { formatDate } from '../../lib/utils';

interface CurrentPlanCardProps {
  subscription: SubscriptionData;
  onUpgradeClick: () => void;
  onManageBillingClick: () => void;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  trialing: 'bg-blue-100 text-blue-800',
  past_due: 'bg-red-100 text-red-800',
  canceled: 'bg-gray-100 text-gray-800',
  incomplete: 'bg-yellow-100 text-yellow-800',
  incomplete_expired: 'bg-gray-100 text-gray-800',
  unpaid: 'bg-red-100 text-red-800',
};

const planColors: Record<string, string> = {
  free: 'bg-gray-500',
  starter: 'bg-blue-500',
  pro: 'bg-purple-500',
  enterprise: 'bg-orange-500',
};

export default function CurrentPlanCard({
  subscription,
  onUpgradeClick,
  onManageBillingClick,
}: CurrentPlanCardProps) {
  const isPaid = subscription.has_subscription && subscription.plan_tier !== 'free';
  const showWarning = subscription.status === 'past_due' || subscription.cancel_at_period_end;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className={`${planColors[subscription.plan_tier]} px-6 py-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center text-white">
            <CreditCard className="h-6 w-6 mr-3" />
            <div>
              <h2 className="text-lg font-semibold">Current Plan</h2>
              <p className="text-sm opacity-90">{subscription.organization_name}</p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[subscription.status]}`}>
            {subscription.status.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Warning Banner */}
        {showWarning && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              {subscription.status === 'past_due' && (
                <>Your payment is past due. Please update your payment method to continue service.</>
              )}
              {subscription.cancel_at_period_end && (
                <>
                  Your subscription will be canceled at the end of the current billing period
                  {subscription.current_period_end && (
                    <> on {formatDate(subscription.current_period_end, 'MMM d, yyyy')}</>
                  )}
                  .
                </>
              )}
            </div>
          </div>
        )}

        {/* Plan Details */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-gray-900">{subscription.plan_name}</p>
              <p className="text-sm text-gray-500">
                {subscription.billing_cycle === 'annual' ? 'Annual billing' : 'Monthly billing'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">{subscription.price_display}</p>
              {isPaid && subscription.billing_cycle === 'annual' && (
                <p className="text-xs text-green-600">Save 17% with annual</p>
              )}
            </div>
          </div>

          {/* Billing Period */}
          {isPaid && subscription.current_period_end && (
            <div className="flex items-center text-sm text-gray-600 pt-2 border-t">
              <Calendar className="h-4 w-4 mr-2" />
              <span>
                {subscription.cancel_at_period_end ? 'Ends' : 'Next billing date'}:{' '}
                {formatDate(subscription.current_period_end, 'MMMM d, yyyy')}
              </span>
            </div>
          )}

          {/* Trial Info */}
          {subscription.status === 'trialing' && subscription.current_period_end && (
            <div className="flex items-center text-sm text-blue-600 pt-2 border-t">
              <Clock className="h-4 w-4 mr-2" />
              <span>Trial ends on {formatDate(subscription.current_period_end, 'MMMM d, yyyy')}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          {subscription.plan_tier !== 'enterprise' && (
            <button
              onClick={onUpgradeClick}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              {subscription.plan_tier === 'free' ? 'Upgrade Plan' : 'Change Plan'}
            </button>
          )}
          {isPaid && (
            <button
              onClick={onManageBillingClick}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
            >
              Manage Billing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
