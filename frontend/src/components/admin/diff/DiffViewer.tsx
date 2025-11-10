/**
 * DiffViewer Component - CV-007
 *
 * Displays the actual diff content with multiple view modes and highlighting
 */

import React, { useMemo } from 'react';
import { DiffResult, DiffChange } from '../../../types/versioning';
import { ViewMode, HighlightLevel } from './VersionComparison';

interface DiffViewerProps {
  diffResult: DiffResult;
  viewMode: ViewMode;
  highlightLevel: HighlightLevel;
  showMetadata: boolean;
  currentChangeIndex: number;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({
  diffResult,
  viewMode,
  highlightLevel,
  showMetadata,
  currentChangeIndex
}) => {
  // Process changes for display
  const processedChanges = useMemo(() => {
    return diffResult.textDiff.changes.map((change, index) => ({
      ...change,
      index: change.type !== 'unchanged' ? index : -1
    }));
  }, [diffResult.textDiff.changes]);

  // Render change with appropriate styling
  const renderChange = (change: DiffChange, index: number, side?: 'left' | 'right') => {
    const isCurrentChange = index === currentChangeIndex && change.type !== 'unchanged';

    let className = 'px-4 py-1 font-mono text-sm whitespace-pre-wrap ';
    if (highlightLevel === 'character') {
      className += 'tracking-tight ';
    } else if (highlightLevel === 'word') {
      className += 'leading-relaxed ';
    }
    let indicator = '  ';

    switch (change.type) {
      case 'add':
        if (side === 'left' && viewMode === 'side-by-side') {
          return null; // Don't show additions on left side
        }
        className += 'bg-green-50 text-green-800 border-l-4 border-green-400';
        indicator = '+ ';
        break;
      case 'remove':
        if (side === 'right' && viewMode === 'side-by-side') {
          return null; // Don't show removals on right side
        }
        className += 'bg-red-50 text-red-800 border-l-4 border-red-400 line-through';
        indicator = '- ';
        break;
      case 'modify':
        className += 'bg-yellow-50 text-yellow-800 border-l-4 border-yellow-400';
        indicator = '~ ';
        break;
      default:
        className += 'text-gray-700';
        break;
    }

    if (isCurrentChange) {
      className += ' ring-2 ring-blue-500';
    }

    const changeIndex = change.type !== 'unchanged' ? processedChanges.filter(c => c.type !== 'unchanged').findIndex(c => c === change) : -1;

    return (
      <div
        key={`${side || 'unified'}-${index}`}
        className={className}
        data-change-index={changeIndex >= 0 ? changeIndex : undefined}
        data-testid={`line-${change.type === 'add' ? 'added' : change.type === 'remove' ? 'removed' : change.type === 'modify' ? 'modified' : 'unchanged'}`}
        aria-label={
          change.type !== 'unchanged'
            ? `${change.type === 'add' ? 'Added' : change.type === 'remove' ? 'Removed' : 'Modified'} content at line ${change.lineNumberNew || change.lineNumberOld}`
            : undefined
        }
      >
        <span className="select-none text-gray-500 mr-2">
          {change.lineNumberOld && side !== 'right' && (
            <span className="inline-block w-12 text-right mr-2">
              {change.lineNumberOld}
            </span>
          )}
          {change.lineNumberNew && side !== 'left' && (
            <span className="inline-block w-12 text-right mr-2">
              {change.lineNumberNew}
            </span>
          )}
        </span>
        <span className="select-none text-gray-400">{indicator}</span>
        <span dangerouslySetInnerHTML={{ __html: sanitizeAndHighlight(change.content) }} />
      </div>
    );
  };

  // Sanitize and add syntax highlighting
  const sanitizeAndHighlight = (content: string): string => {
    // Basic HTML escaping
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    // Add basic syntax highlighting for common patterns
    return escaped
      .replace(/(&lt;\/?[a-z]+[^&]*&gt;)/gi, '<span class="text-blue-600">$1</span>') // HTML tags
      .replace(/("[^"]*")/g, '<span class="text-green-600">$1</span>') // Strings
      .replace(/(\b\d+\b)/g, '<span class="text-purple-600">$1</span>'); // Numbers
  };

  // Render metadata changes
  const renderMetadataChanges = () => {
    if (!showMetadata || Object.keys(diffResult.metadataDiff).length === 0) {
      return null;
    }

    return (
      <div className="mt-6 bg-white rounded-lg shadow-sm p-4" data-testid="metadata-diff">
        <h3 className="font-semibold text-gray-900 mb-3">Metadata Changes</h3>
        <div className="space-y-2">
          {Object.entries(diffResult.metadataDiff).map(([field, change]) => {
            if (!change) return null;

            return (
              <div key={field} className="flex items-start space-x-2" data-testid={`${field}-change`}>
                <span className="font-medium text-gray-700 min-w-[120px]">{field}:</span>
                <div className="flex-1">
                  {change.changeType === 'modified' ? (
                    <>
                      <span className="inline-block bg-red-50 text-red-700 px-2 py-1 rounded text-sm line-through" data-testid="old-value">
                        {String(change.oldValue)}
                      </span>
                      <span className="mx-2">→</span>
                      <span className="inline-block bg-green-50 text-green-700 px-2 py-1 rounded text-sm" data-testid="new-value">
                        {String(change.newValue)}
                      </span>
                    </>
                  ) : change.changeType === 'added' ? (
                    <span className="inline-block bg-green-50 text-green-700 px-2 py-1 rounded text-sm">
                      Added: {String(change.newValue)}
                    </span>
                  ) : (
                    <span className="inline-block bg-red-50 text-red-700 px-2 py-1 rounded text-sm">
                      Removed: {String(change.oldValue)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render based on view mode
  if (viewMode === 'side-by-side') {
    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden" data-testid="left-version">
            <div className="bg-gray-100 px-4 py-2 font-semibold text-sm text-gray-700">
              Version {diffResult.leftVersion.version_number}
            </div>
            <div className="divide-y divide-gray-200">
              {processedChanges.map((change, index) => {
                if (change.type === 'add') return null;
                return renderChange(change, index, 'left');
              })}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm overflow-hidden" data-testid="right-version">
            <div className="bg-gray-100 px-4 py-2 font-semibold text-sm text-gray-700">
              Version {diffResult.rightVersion.version_number}
            </div>
            <div className="divide-y divide-gray-200">
              {processedChanges.map((change, index) => {
                if (change.type === 'remove') return null;
                return renderChange(change, index, 'right');
              })}
            </div>
          </div>
        </div>
        {renderMetadataChanges()}
      </>
    );
  }

  if (viewMode === 'unified') {
    return (
      <>
        <div className="bg-white rounded-lg shadow-sm overflow-hidden" data-testid="unified-diff">
          <div className="bg-gray-100 px-4 py-2 font-semibold text-sm text-gray-700">
            Unified Diff View
          </div>
          <div className="divide-y divide-gray-200">
            {processedChanges.map((change, index) => renderChange(change, index))}
          </div>
        </div>
        {renderMetadataChanges()}
      </>
    );
  }

  // Inline view
  return (
    <>
      <div className="bg-white rounded-lg shadow-sm overflow-hidden" data-testid="inline-diff">
        <div className="bg-gray-100 px-4 py-2 font-semibold text-sm text-gray-700">
          Inline Diff View
        </div>
        <div className="p-4">
          <div className="prose max-w-none">
            {processedChanges.map((change, index) => {
              if (change.type === 'unchanged') {
                return (
                  <span key={index} className="text-gray-700">
                    {change.content}
                  </span>
                );
              }

              const changeIndex = processedChanges.filter(c => c.type !== 'unchanged').findIndex(c => c === change);

              if (change.type === 'add') {
                return (
                  <span
                    key={index}
                    className="bg-green-100 text-green-800 px-1 rounded"
                    data-change-index={changeIndex}
                    data-testid="inline-change"
                  >
                    {change.content}
                  </span>
                );
              }

              if (change.type === 'remove') {
                return (
                  <span
                    key={index}
                    className="bg-red-100 text-red-800 px-1 rounded line-through"
                    data-change-index={changeIndex}
                    data-testid="inline-change"
                  >
                    {change.content}
                  </span>
                );
              }

              return (
                <span
                  key={index}
                  className="bg-yellow-100 text-yellow-800 px-1 rounded"
                  data-change-index={changeIndex}
                  data-testid="inline-change"
                >
                  {change.content}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      {renderMetadataChanges()}
    </>
  );
};