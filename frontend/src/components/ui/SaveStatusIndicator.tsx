import { useMemo } from 'react';
import { AutoSaveStatus } from '../../hooks/useAutoSave';
import { Check, Loader2, AlertCircle, CloudOff, Circle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SaveStatusIndicatorProps {
  status: AutoSaveStatus;
  lastSaved?: Date | null;
  hasUnsavedChanges?: boolean;
  onManualSave?: () => void;
  className?: string;
}

export function SaveStatusIndicator({
  status,
  lastSaved,
  hasUnsavedChanges = false,
  onManualSave,
  className
}: SaveStatusIndicatorProps) {
  // Format time ago
  const timeAgo = useMemo(() => {
    if (!lastSaved) return null;

    const now = new Date();
    const diff = now.getTime() - lastSaved.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    if (seconds > 30) {
      return `${seconds} seconds ago`;
    }
    return 'Just now';
  }, [lastSaved]);

  // Determine display based on status
  const statusDisplay = useMemo(() => {
    switch (status) {
      case 'saving':
        return {
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          text: 'Saving...',
          className: 'text-blue-600 bg-blue-50 border-blue-200'
        };
      case 'saved':
        return {
          icon: <Check className="h-4 w-4" />,
          text: 'Saved',
          className: 'text-green-600 bg-green-50 border-green-200'
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-4 w-4" />,
          text: 'Save failed',
          className: 'text-red-600 bg-red-50 border-red-200',
          action: onManualSave ? 'Retry' : undefined
        };
      case 'offline':
        return {
          icon: <CloudOff className="h-4 w-4" />,
          text: 'Offline - will sync',
          className: 'text-orange-600 bg-orange-50 border-orange-200'
        };
      default:
        if (hasUnsavedChanges) {
          return {
            icon: <Circle className="h-4 w-4 fill-yellow-500" />,
            text: 'Unsaved changes',
            className: 'text-yellow-700 bg-yellow-50 border-yellow-200'
          };
        }
        return {
          icon: <Check className="h-4 w-4" />,
          text: 'Saved',
          className: 'text-gray-600 bg-gray-50 border-gray-200 opacity-75'
        };
    }
  }, [status, hasUnsavedChanges, onManualSave]);

  // Don't show if idle and no unsaved changes (after initial save)
  const shouldShow = status !== 'idle' || hasUnsavedChanges || !lastSaved;

  if (!shouldShow && lastSaved) {
    return null;
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-all duration-200',
        statusDisplay.className,
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={`Save status: ${statusDisplay.text}${timeAgo ? `, ${timeAgo}` : ''}`}
    >
      {statusDisplay.icon}
      <span className="font-medium">{statusDisplay.text}</span>
      {timeAgo && status === 'saved' && (
        <>
          <span className="text-gray-400">•</span>
          <span className="text-gray-600">{timeAgo}</span>
        </>
      )}
      {statusDisplay.action && (
        <button
          onClick={onManualSave}
          className="ml-2 underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 rounded"
          aria-label="Retry save"
        >
          {statusDisplay.action}
        </button>
      )}
    </div>
  );
}

// Mobile-optimized version (icon only)
export function SaveStatusIndicatorCompact({
  status,
  lastSaved,
  hasUnsavedChanges = false,
  onManualSave,
  className
}: SaveStatusIndicatorProps) {
  const statusDisplay = useMemo(() => {
    switch (status) {
      case 'saving':
        return {
          icon: <Loader2 className="h-5 w-5 animate-spin text-blue-600" />,
          ariaLabel: 'Saving...'
        };
      case 'saved':
        return {
          icon: <Check className="h-5 w-5 text-green-600" />,
          ariaLabel: `Saved${lastSaved ? ` ${timeAgo}` : ''}`
        };
      case 'error':
        return {
          icon: <AlertCircle className="h-5 w-5 text-red-600" />,
          ariaLabel: 'Save failed'
        };
      case 'offline':
        return {
          icon: <CloudOff className="h-5 w-5 text-orange-600" />,
          ariaLabel: 'Offline - will sync when reconnected'
        };
      default:
        if (hasUnsavedChanges) {
          return {
            icon: <Circle className="h-5 w-5 fill-yellow-500 text-yellow-500" />,
            ariaLabel: 'Unsaved changes'
          };
        }
        return {
          icon: <Check className="h-5 w-5 text-gray-400" />,
          ariaLabel: 'All changes saved'
        };
    }
  }, [status, hasUnsavedChanges, lastSaved]);

  const timeAgo = useMemo(() => {
    if (!lastSaved) return null;

    const now = new Date();
    const diff = now.getTime() - lastSaved.getTime();
    const minutes = Math.floor(diff / 1000 / 60);

    if (minutes < 1) return null;
    return `${minutes}m`;
  }, [lastSaved]);

  return (
    <button
      onClick={status === 'error' ? onManualSave : undefined}
      disabled={status !== 'error'}
      className={cn(
        'inline-flex items-center justify-center p-2 rounded-full transition-all',
        status === 'error' ? 'hover:bg-red-100 cursor-pointer' : 'cursor-default',
        className
      )}
      aria-label={statusDisplay.ariaLabel}
      role="status"
      aria-live="polite"
    >
      {statusDisplay.icon}
      {timeAgo && status === 'saved' && (
        <span className="ml-1 text-xs text-gray-500">{timeAgo}</span>
      )}
    </button>
  );
}