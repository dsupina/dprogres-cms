/**
 * VersionComparison Component - CV-007
 *
 * Main component for comparing two content versions with multiple view modes,
 * change navigation, and export functionality.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Eye, Layers, List } from 'lucide-react';
import { DiffViewer } from './DiffViewer';
import { ChangeNavigator } from './ChangeNavigator';
import { ChangeStatistics } from './ChangeStatistics';
import { api } from '../../../services/api';
import { ContentVersion, DiffResult } from '../../../types/versioning';
import { LoadingSpinner } from '../../ui/LoadingSpinner';
import { toast } from 'react-hot-toast';

export type ViewMode = 'side-by-side' | 'unified' | 'inline';
export type HighlightLevel = 'line' | 'word' | 'character';

interface VersionComparisonProps {
  leftVersionId: number;
  rightVersionId: number;
  onClose?: () => void;
}

export const VersionComparison: React.FC<VersionComparisonProps> = ({
  leftVersionId,
  rightVersionId,
  onClose
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [highlightLevel, setHighlightLevel] = useState<HighlightLevel>('line');
  const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
  const [showStatistics, setShowStatistics] = useState(true);
  const [showMetadata, setShowMetadata] = useState(true);
  const diffContainerRef = useRef<HTMLDivElement>(null);

  // Fetch diff data
  const { data: diffResult, isLoading, error } = useQuery({
    queryKey: ['versions', 'compare', leftVersionId, rightVersionId, highlightLevel],
    queryFn: async () => {
      const response = await api.get('/api/versions/compare', {
        params: {
          version_a_id: leftVersionId,
          version_b_id: rightVersionId,
          diff_type: 'all',
          granularity: highlightLevel,
          include_unchanged: false,
          algorithm: 'myers'
        }
      });
      return response.data.data as DiffResult;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000 // 10 minutes
  });

  // Calculate total changes
  const totalChanges = diffResult?.textDiff?.changes?.filter(c => c.type !== 'unchanged').length || 0;

  // Navigate to specific change
  const navigateToChange = useCallback((index: number) => {
    if (!diffResult || !diffContainerRef.current) return;

    const changes = diffResult.textDiff.changes.filter(c => c.type !== 'unchanged');
    if (index < 0 || index >= changes.length) return;

    setCurrentChangeIndex(index);

    // Find and scroll to the change element
    const changeElements = diffContainerRef.current.querySelectorAll('[data-change-index]');
    const targetElement = changeElements[index] as HTMLElement;

    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Highlight the change temporarily
      targetElement.classList.add('ring-2', 'ring-blue-500');
      setTimeout(() => {
        targetElement.classList.remove('ring-2', 'ring-blue-500');
      }, 2000);
    }
  }, [diffResult]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'n':
        case 'ArrowDown':
          if (currentChangeIndex < totalChanges - 1) {
            navigateToChange(currentChangeIndex + 1);
          }
          break;
        case 'p':
        case 'ArrowUp':
          if (currentChangeIndex > 0) {
            navigateToChange(currentChangeIndex - 1);
          }
          break;
        case 's':
          setShowStatistics(!showStatistics);
          break;
        case 'm':
          setShowMetadata(!showMetadata);
          break;
        case 'Escape':
          onClose?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentChangeIndex, totalChanges, navigateToChange, showStatistics, showMetadata, onClose]);

  // Export diff
  const handleExport = async (format: 'pdf' | 'html' | 'json') => {
    try {
      const response = await api.post('/api/versions/diff/export', {
        version_ids: [leftVersionId, rightVersionId],
        format,
        include_metadata: showMetadata,
        include_statistics: showStatistics,
        include_unchanged: false
      }, {
        responseType: format === 'json' ? 'json' : 'blob'
      });

      // Create download link
      const blob = new Blob([response.data], {
        type: format === 'pdf' ? 'application/pdf' :
              format === 'html' ? 'text/html' :
              'application/json'
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `version-comparison-${leftVersionId}-${rightVersionId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(`Exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export diff');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <LoadingSpinner className="w-8 h-8 mx-auto mb-4" />
          <p className="text-gray-600">Computing differences...</p>
        </div>
      </div>
    );
  }

  if (error || !diffResult) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Error computing differences</h3>
          <p className="text-gray-600">{error?.toString() || 'Failed to load comparison'}</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" data-testid="diff-container">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={onClose}
                className="p-2 rounded-md hover:bg-gray-100"
                aria-label="Close comparison"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h1 className="ml-4 text-lg font-semibold text-gray-900">
                Version Comparison
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              {/* View Mode Selector */}
              <div className="flex items-center space-x-2" data-testid="view-mode-selector">
                <button
                  onClick={() => setViewMode('side-by-side')}
                  className={`p-2 rounded ${viewMode === 'side-by-side' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="Side by side view"
                  data-testid="view-mode-side-by-side"
                >
                  <Layers className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('unified')}
                  className={`p-2 rounded ${viewMode === 'unified' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="Unified view"
                  data-testid="view-mode-unified"
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('inline')}
                  className={`p-2 rounded ${viewMode === 'inline' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
                  title="Inline view"
                  data-testid="view-mode-inline"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </div>

              {/* Highlight Level Selector */}
              <select
                value={highlightLevel}
                onChange={(e) => setHighlightLevel(e.target.value as HighlightLevel)}
                className="text-sm border-gray-300 rounded-md"
                data-testid="highlight-level-selector"
              >
                <option value="line">Line</option>
                <option value="word">Word</option>
                <option value="character">Character</option>
              </select>

              {/* Export Dropdown */}
              <div className="relative group" data-testid="export-dropdown">
                <button className="p-2 rounded hover:bg-gray-100">
                  <Download className="h-4 w-4" />
                </button>
                <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 hidden group-hover:block" data-testid="export-menu">
                  <div className="py-1">
                    <button
                      onClick={() => handleExport('pdf')}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      data-testid="export-pdf"
                    >
                      Export as PDF
                    </button>
                    <button
                      onClick={() => handleExport('html')}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      data-testid="export-html"
                    >
                      Export as HTML
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      data-testid="export-json"
                    >
                      Export as JSON
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Change Navigator */}
      {totalChanges > 0 && (
        <ChangeNavigator
          currentIndex={currentChangeIndex}
          totalChanges={totalChanges}
          onNavigate={navigateToChange}
        />
      )}

      {/* Statistics Panel */}
      {showStatistics && diffResult.statistics && (
        <ChangeStatistics
          statistics={diffResult.statistics}
          onClose={() => setShowStatistics(false)}
        />
      )}

      {/* Main Content */}
      <div className="max-w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Version Headers */}
        <div className={`grid ${viewMode === 'side-by-side' ? 'grid-cols-2 gap-4' : 'grid-cols-1'} mb-4`}>
          <div className="bg-white p-4 rounded-lg shadow-sm" data-testid="left-version-info">
            <h2 className="font-semibold text-gray-900">
              Version {diffResult.leftVersion.version_number}
            </h2>
            <p className="text-sm text-gray-600">
              {diffResult.leftVersion.version_type} • {new Date(diffResult.leftVersion.created_at).toLocaleString()}
            </p>
            <p className="text-sm text-gray-700 mt-1">{diffResult.leftVersion.title}</p>
          </div>

          {viewMode === 'side-by-side' && (
            <div className="bg-white p-4 rounded-lg shadow-sm" data-testid="right-version-info">
              <h2 className="font-semibold text-gray-900">
                Version {diffResult.rightVersion.version_number}
              </h2>
              <p className="text-sm text-gray-600">
                {diffResult.rightVersion.version_type} • {new Date(diffResult.rightVersion.created_at).toLocaleString()}
              </p>
              <p className="text-sm text-gray-700 mt-1">{diffResult.rightVersion.title}</p>
            </div>
          )}
        </div>

        {/* Diff Viewer */}
        <div ref={diffContainerRef}>
          <DiffViewer
            diffResult={diffResult}
            viewMode={viewMode}
            highlightLevel={highlightLevel}
            showMetadata={showMetadata}
            currentChangeIndex={currentChangeIndex}
          />
        </div>
      </div>
    </div>
  );
};