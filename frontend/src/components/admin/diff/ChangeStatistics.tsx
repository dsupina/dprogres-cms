/**
 * ChangeStatistics Component - CV-007
 *
 * Displays statistics about the changes between versions
 */

import React from 'react';
import { X } from 'lucide-react';
import { ChangeStatistics as Stats } from '../../../types/versioning';

interface ChangeStatisticsProps {
  statistics: Stats;
  onClose?: () => void;
}

export const ChangeStatistics: React.FC<ChangeStatisticsProps> = ({
  statistics,
  onClose
}) => {
  return (
    <div
      className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4"
      role="complementary"
      aria-label="Change statistics"
      data-testid="change-statistics"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Change Summary</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close statistics"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="text-center">
          <div
            className="text-2xl font-bold text-blue-600"
            data-testid="total-changes"
          >
            {statistics.totalChanges}
          </div>
          <div className="text-xs text-gray-500">total changes</div>
        </div>

        <div className="text-center">
          <div
            className="text-2xl font-bold text-green-600"
            data-testid="lines-added"
          >
            +{statistics.linesAdded}
          </div>
          <div className="text-xs text-gray-500">
            {statistics.linesAdded === 1 ? 'addition' : 'additions'}
          </div>
        </div>

        <div className="text-center">
          <div
            className="text-2xl font-bold text-red-600"
            data-testid="lines-removed"
          >
            -{statistics.linesRemoved}
          </div>
          <div className="text-xs text-gray-500">
            {statistics.linesRemoved === 1 ? 'deletion' : 'deletions'}
          </div>
        </div>

        <div className="text-center">
          <div
            className="text-2xl font-bold text-yellow-600"
            data-testid="lines-modified"
          >
            ~{statistics.linesModified}
          </div>
          <div className="text-xs text-gray-500">
            {statistics.linesModified === 1 ? 'modification' : 'modifications'}
          </div>
        </div>

        <div className="text-center">
          <div
            className="text-2xl font-bold text-purple-600"
            data-testid="change-percentage"
          >
            {statistics.changePercent}%
          </div>
          <div className="text-xs text-gray-500">changed</div>
        </div>

        <div className="text-center">
          <div className="text-2xl font-bold text-gray-600">
            {statistics.reviewTimeEstimate}m
          </div>
          <div className="text-xs text-gray-500">review time</div>
        </div>
      </div>

      {statistics.majorChanges && statistics.majorChanges.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Major Changes</h4>
          <div
            className="flex flex-wrap gap-2"
            data-testid="major-changes"
          >
            {statistics.majorChanges.map((change, index) => (
              <span
                key={index}
                className="inline-block px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded"
              >
                {change}
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        className="hidden"
        aria-live="polite"
        aria-label="Changes summary"
      >
        {statistics.totalChanges} total changes:
        {statistics.linesAdded} additions,
        {statistics.linesRemoved} deletions,
        {statistics.linesModified} modifications
      </div>
    </div>
  );
};