import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, ArrowRight } from 'lucide-react';

/**
 * BillingSuccessPage - Stripe Checkout Success Handler (SF-018)
 *
 * Displays a confirmation message after successful Stripe Checkout.
 * - Shows success animation/message
 * - Invalidates billing queries to refresh data
 * - Auto-redirects to billing page after countdown
 * - Provides manual navigation button
 */
export default function BillingSuccessPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [countdown, setCountdown] = useState(5);

  // Invalidate billing queries to ensure fresh data on billing page
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['billing-subscription'] });
    queryClient.invalidateQueries({ queryKey: ['billing-usage'] });
    queryClient.invalidateQueries({ queryKey: ['billing-invoices'] });
  }, [queryClient]);

  // Auto-redirect countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/admin/billing');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-md w-full text-center p-8">
        {/* Success Icon */}
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>

        {/* Success Message */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Subscription Activated!
        </h1>
        <p className="text-gray-600 mb-6">
          Thank you for your subscription. Your plan has been successfully
          upgraded and all features are now available.
        </p>

        {/* Auto-redirect notice */}
        <p className="text-sm text-gray-500 mb-6">
          Redirecting to billing page in {countdown} seconds...
        </p>

        {/* Manual Navigation */}
        <Link
          to="/admin/billing"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          Go to Billing
          <ArrowRight className="ml-2 h-4 w-4" />
        </Link>

        {/* Additional Info */}
        <div className="mt-8 p-4 bg-blue-50 rounded-lg text-left">
          <h3 className="font-medium text-blue-900 mb-2">What's next?</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>Your new plan limits are now active</li>
            <li>You'll receive a confirmation email shortly</li>
            <li>View your invoice in the billing dashboard</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
