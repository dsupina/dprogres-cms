import React from 'react';
import { clsx } from 'clsx';

interface Column {
  key: string;
  label: string;
  render?: (value: any, item: any) => React.ReactNode;
}

interface Action {
  label: string;
  onClick: (item: any) => void;
  className?: string;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean | ((item: any) => boolean);
}

interface DataTableProps {
  data: any[];
  columns: Column[];
  actions?: Action[];
}

export default function DataTable({ data, columns, actions = [] }: DataTableProps) {
  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No data available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map(column => (
              <th
                key={column.key}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {column.label}
              </th>
            ))}
            {actions.length > 0 && (
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((item, index) => (
            <tr key={index} className="hover:bg-gray-50">
              {columns.map(column => (
                <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {column.render
                    ? column.render(item[column.key], item)
                    : item[column.key]
                  }
                </td>
              ))}
              {actions.length > 0 && (
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end gap-2">
                    {actions.map((action, actionIndex) => {
                      const isDisabled = typeof action.disabled === 'function'
                        ? action.disabled(item)
                        : action.disabled;

                      const getVariantClasses = () => {
                        switch (action.variant) {
                          case 'danger':
                            return 'text-red-600 hover:text-red-700 hover:bg-red-50 focus:ring-red-500';
                          case 'secondary':
                            return 'text-gray-600 hover:text-gray-700 hover:bg-gray-50 focus:ring-gray-500';
                          case 'ghost':
                            return 'text-gray-400 hover:text-gray-600 hover:bg-gray-50 focus:ring-gray-500';
                          default:
                            return 'text-primary-600 hover:text-primary-700 hover:bg-primary-50 focus:ring-primary-500';
                        }
                      };

                      return (
                        <button
                          key={actionIndex}
                          onClick={() => !isDisabled && action.onClick(item)}
                          disabled={isDisabled}
                          className={clsx(
                            // Base styles for all action buttons
                            'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md',
                            'transition-all duration-150 ease-in-out',
                            'focus:outline-none focus:ring-2 focus:ring-offset-1',
                            'min-w-[44px] min-h-[44px] touch-manipulation', // Accessibility: 44px touch target
                            // Variant styles
                            !isDisabled && getVariantClasses(),
                            // Disabled styles
                            isDisabled && 'text-gray-400 cursor-not-allowed opacity-60',
                            // Custom className override
                            action.className
                          )}
                          title={`${action.label} ${item.name || ''}`}
                          aria-label={`${action.label} ${item.name || ''}`}
                        >
                          {action.icon && (
                            <span className="flex-shrink-0 w-4 h-4" aria-hidden="true">
                              {action.icon}
                            </span>
                          )}
                          <span className="sr-only sm:not-sr-only">
                            {action.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}