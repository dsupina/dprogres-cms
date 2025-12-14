import { useState } from 'react';
import { X, Check, Sparkles } from 'lucide-react';
import type { Plan } from '../../services/billing';
import LoadingSpinner from '../ui/LoadingSpinner';

interface UpgradeModalProps {
  plans: Plan[];
  currentPlanTier: string;
  onClose: () => void;
  onUpgrade: (planTier: 'starter' | 'pro', billingCycle: 'monthly' | 'annual') => Promise<void>;
  isLoading: boolean;
}

export default function UpgradeModal({
  plans,
  currentPlanTier,
  onClose,
  onUpgrade,
  isLoading,
}: UpgradeModalProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  // Filter to show only paid plans (exclude free and enterprise for self-service)
  const displayPlans = plans.filter(
    (p) => p.tier !== 'free' && p.tier !== 'enterprise'
  );

  const handleUpgrade = async (planTier: 'starter' | 'pro') => {
    setSelectedPlan(planTier);
    await onUpgrade(planTier, billingCycle);
  };

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Choose Your Plan</h2>
            <p className="text-sm text-gray-500 mt-1">
              Select the plan that best fits your needs
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Billing Cycle Toggle */}
        <div className="px-6 py-4 flex justify-center">
          <div className="bg-gray-100 rounded-lg p-1 inline-flex">
            <button
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                billingCycle === 'monthly'
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setBillingCycle('monthly')}
            >
              Monthly
            </button>
            <button
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center ${
                billingCycle === 'annual'
                  ? 'bg-white shadow text-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setBillingCycle('annual')}
            >
              Annual
              <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                Save 17%
              </span>
            </button>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="px-6 pb-6 grid md:grid-cols-2 gap-6">
          {displayPlans.map((plan) => {
            const price = billingCycle === 'annual' ? plan.price_annual : plan.price_monthly;
            const isCurrentPlan = plan.tier === currentPlanTier;
            const isDowngrade =
              (currentPlanTier === 'pro' && plan.tier === 'starter') ||
              (currentPlanTier === 'enterprise');

            return (
              <div
                key={plan.tier}
                className={`relative rounded-xl border-2 ${
                  plan.is_popular
                    ? 'border-primary-500 shadow-lg'
                    : 'border-gray-200'
                } p-6 flex flex-col`}
              >
                {/* Popular Badge */}
                {plan.is_popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary-500 text-white">
                      <Sparkles className="h-3 w-3 mr-1" />
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Plan Header */}
                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-gray-900">
                      ${price}
                    </span>
                    <span className="text-gray-500">
                      /{billingCycle === 'annual' ? 'year' : 'month'}
                    </span>
                  </div>
                  {billingCycle === 'annual' && plan.price_monthly && (
                    <p className="text-xs text-gray-500 mt-1">
                      ${Math.round(price! / 12)}/mo billed annually
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3 flex-grow">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start">
                      <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                      <span className="text-sm text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Action Button */}
                <div className="mt-6">
                  {isCurrentPlan ? (
                    <button
                      disabled
                      className="w-full py-3 px-4 rounded-lg border border-gray-300 text-gray-500 text-sm font-medium cursor-not-allowed"
                    >
                      Current Plan
                    </button>
                  ) : isDowngrade ? (
                    <button
                      disabled
                      className="w-full py-3 px-4 rounded-lg border border-gray-300 text-gray-500 text-sm font-medium cursor-not-allowed"
                    >
                      Contact Support to Downgrade
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(plan.tier as 'starter' | 'pro')}
                      disabled={isLoading}
                      className={`w-full py-3 px-4 rounded-lg text-sm font-medium transition-colors ${
                        plan.is_popular
                          ? 'bg-primary-600 text-white hover:bg-primary-700'
                          : 'bg-gray-900 text-white hover:bg-gray-800'
                      } disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center`}
                    >
                      {isLoading && selectedPlan === plan.tier ? (
                        <>
                          <LoadingSpinner size="sm" className="mr-2" />
                          Processing...
                        </>
                      ) : (
                        <>
                          {currentPlanTier === 'free' ? 'Get Started' : 'Upgrade'} to {plan.name}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Enterprise CTA */}
        <div className="px-6 pb-6">
          <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-6 border border-orange-200">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Need more?</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Enterprise plans include unlimited resources, dedicated support, and custom integrations.
                </p>
              </div>
              <a
                href="mailto:sales@dprogres.com"
                className="inline-flex items-center px-6 py-3 border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-100 transition-colors text-sm font-medium whitespace-nowrap"
              >
                Contact Sales
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
