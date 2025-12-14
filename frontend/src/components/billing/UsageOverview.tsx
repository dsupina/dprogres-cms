import { Globe, FileText, Users, HardDrive, Activity, ArrowUpCircle } from 'lucide-react';
import type { UsageItem } from '../../services/billing';

interface UsageOverviewProps {
  usage: UsageItem[];
  onUpgradeClick?: () => void;
}

const dimensionIcons: Record<string, React.ElementType> = {
  sites: Globe,
  posts: FileText,
  users: Users,
  storage_bytes: HardDrive,
  api_calls: Activity,
};

const dimensionColors: Record<string, string> = {
  sites: 'bg-blue-500',
  posts: 'bg-green-500',
  users: 'bg-purple-500',
  storage_bytes: 'bg-orange-500',
  api_calls: 'bg-cyan-500',
};

export default function UsageOverview({ usage, onUpgradeClick }: UsageOverviewProps) {
  // Check if any quota is exceeded (100% or more)
  const hasExceededQuota = usage.some(
    (item) => !item.is_unlimited && item.percentage >= 100
  );

  // Check if any quota is in warning or critical state
  const hasQuotaWarning = usage.some(
    (item) => !item.is_unlimited && (item.is_warning || item.is_critical)
  );

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Usage Overview</h2>
        {hasExceededQuota && onUpgradeClick && (
          <button
            onClick={onUpgradeClick}
            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            data-testid="upgrade-cta-header"
          >
            <ArrowUpCircle className="h-4 w-4 mr-1.5" />
            Upgrade Now
          </button>
        )}
      </div>

      <div className="space-y-6">
        {usage.map((item) => {
          const Icon = dimensionIcons[item.dimension] || Activity;
          const colorClass = dimensionColors[item.dimension] || 'bg-gray-500';
          const isExceeded = !item.is_unlimited && item.percentage >= 100;

          return (
            <div key={item.dimension} data-testid={`quota-item-${item.dimension}`}>
              {/* Label Row */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <div className={`${colorClass} p-1.5 rounded-md mr-2`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-gray-900">{item.label}</span>
                </div>
                <span className="text-sm text-gray-600">
                  {item.current_display} / {item.limit_display}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="relative">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  {item.is_unlimited ? (
                    <div className="h-full w-full bg-gradient-to-r from-gray-200 to-gray-300" />
                  ) : (
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        item.is_critical
                          ? 'bg-red-500'
                          : item.is_warning
                          ? 'bg-yellow-500'
                          : colorClass
                      }`}
                      style={{ width: `${Math.min(item.percentage, 100)}%` }}
                      data-testid={`progress-bar-${item.dimension}`}
                    />
                  )}
                </div>

                {/* Percentage Label */}
                <div className="absolute right-0 -top-5 text-xs text-gray-500">
                  {item.is_unlimited ? 'Unlimited' : `${Math.round(item.percentage)}%`}
                </div>
              </div>

              {/* Exceeded State with Upgrade CTA */}
              {isExceeded && onUpgradeClick && (
                <div className="flex items-center justify-between mt-2 p-2 bg-red-50 rounded-md">
                  <p className="text-xs text-red-700 font-medium">
                    Quota exceeded! Upgrade to continue using {item.label.toLowerCase()}.
                  </p>
                  <button
                    onClick={onUpgradeClick}
                    className="ml-2 text-xs font-medium text-red-700 hover:text-red-800 underline"
                    data-testid={`upgrade-cta-${item.dimension}`}
                  >
                    Upgrade
                  </button>
                </div>
              )}

              {/* Warning Messages (when not exceeded) */}
              {!isExceeded && item.is_critical && !item.is_unlimited && (
                <p className="text-xs text-red-600 mt-1">
                  Critical: You've used {Math.round(item.percentage)}% of your {item.label.toLowerCase()}
                </p>
              )}
              {!isExceeded && item.is_warning && !item.is_critical && !item.is_unlimited && (
                <p className="text-xs text-yellow-600 mt-1">
                  Warning: Approaching limit ({item.remaining.toLocaleString()} remaining)
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary Footer */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Usage resets monthly for API calls. Other quotas are cumulative.
          </p>
          {hasQuotaWarning && onUpgradeClick && !hasExceededQuota && (
            <button
              onClick={onUpgradeClick}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
              data-testid="upgrade-cta-footer"
            >
              Upgrade for more resources
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
