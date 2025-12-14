import { Globe, FileText, Users, HardDrive, Activity } from 'lucide-react';
import type { UsageItem } from '../../services/billing';

interface UsageOverviewProps {
  usage: UsageItem[];
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

export default function UsageOverview({ usage }: UsageOverviewProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage Overview</h2>

      <div className="space-y-6">
        {usage.map((item) => {
          const Icon = dimensionIcons[item.dimension] || Activity;
          const colorClass = dimensionColors[item.dimension] || 'bg-gray-500';

          return (
            <div key={item.dimension}>
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
                    />
                  )}
                </div>

                {/* Percentage Label */}
                <div className="absolute right-0 -top-5 text-xs text-gray-500">
                  {item.is_unlimited ? 'Unlimited' : `${Math.round(item.percentage)}%`}
                </div>
              </div>

              {/* Warning Messages */}
              {item.is_critical && !item.is_unlimited && (
                <p className="text-xs text-red-600 mt-1">
                  Critical: You've used {Math.round(item.percentage)}% of your {item.label.toLowerCase()}
                </p>
              )}
              {item.is_warning && !item.is_critical && !item.is_unlimited && (
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
        <p className="text-xs text-gray-500">
          Usage resets monthly for API calls. Other quotas are cumulative.
        </p>
      </div>
    </div>
  );
}
