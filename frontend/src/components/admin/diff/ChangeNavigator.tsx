/**
 * ChangeNavigator Component - CV-007
 *
 * Navigation controls for jumping between changes in the diff
 */

import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ChangeNavigatorProps {
  currentIndex: number;
  totalChanges: number;
  onNavigate: (index: number) => void;
}

export const ChangeNavigator: React.FC<ChangeNavigatorProps> = ({
  currentIndex,
  totalChanges,
  onNavigate
}) => {
  if (totalChanges === 0) {
    return null;
  }

  return (
    <div
      className="fixed bottom-6 right-6 bg-white rounded-lg shadow-lg p-3 z-30"
      data-testid="change-navigator"
      role="navigation"
      aria-label="Change navigation"
    >
      <div className="flex items-center space-x-3">
        <button
          onClick={() => onNavigate(currentIndex - 1)}
          disabled={currentIndex === 0}
          className={`p-2 rounded ${
            currentIndex === 0
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          aria-label="Previous change"
          data-testid="prev-change-btn"
        >
          <ChevronUp className="h-4 w-4" />
        </button>

        <div
          className="text-sm font-medium text-gray-700 min-w-[80px] text-center"
          aria-label="Current change position"
          data-testid="current-change-index"
        >
          {currentIndex + 1} of {totalChanges} changes
        </div>

        <button
          onClick={() => onNavigate(currentIndex + 1)}
          disabled={currentIndex >= totalChanges - 1}
          className={`p-2 rounded ${
            currentIndex >= totalChanges - 1
              ? 'text-gray-400 cursor-not-allowed'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
          aria-label="Next change"
          data-testid="next-change-btn"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 text-xs text-gray-500 text-center">
        Press <kbd className="px-1 bg-gray-100 rounded">n</kbd>/<kbd className="px-1 bg-gray-100 rounded">p</kbd> to navigate
      </div>
    </div>
  );
};