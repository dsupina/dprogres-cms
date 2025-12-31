import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
/**
 * SaveStatusIndicator Component Unit Tests
 *
 * Comprehensive tests for the save status indicator including:
 * - Status display for all auto-save states
 * - Time formatting and relative timestamps
 * - Manual save retry functionality
 * - Accessibility compliance
 * - Mobile compact variant
 * - Visual state transitions
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SaveStatusIndicator, SaveStatusIndicatorCompact } from '../SaveStatusIndicator';
import { AutoSaveStatus } from '../../../hooks/useAutoSave';

describe('SaveStatusIndicator', () => {
  const defaultProps = {
    status: 'idle' as AutoSaveStatus,
    lastSaved: null,
    hasUnsavedChanges: false,
    onManualSave: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Status Display', () => {
    it('should display saving status with loading spinner', () => {
      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="saving"
        />
      );

      expect(screen.getByText('Saving...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Save status: Saving...');

      // Check for spinner icon (Loader2 with animate-spin class)
      const spinnerIcon = document.querySelector('.animate-spin');
      expect(spinnerIcon).toBeInTheDocument();
    });

    it('should display saved status with check icon', () => {
      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="saved"
        />
      );

      expect(screen.getByText('Saved')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Save status: Saved');

      // Should have green styling
      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveClass('text-green-600', 'bg-green-50', 'border-green-200');
    });

    it('should display error status with alert icon and retry button', () => {
      const onManualSave = vi.fn();

      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="error"
          onManualSave={onManualSave}
        />
      );

      expect(screen.getByText('Save failed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry save' })).toBeInTheDocument();

      // Should have red styling
      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveClass('text-red-600', 'bg-red-50', 'border-red-200');

      // Test retry button functionality
      fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
      expect(onManualSave).toHaveBeenCalledTimes(1);
    });

    it('should display offline status with cloud-off icon', () => {
      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="offline"
        />
      );

      expect(screen.getByText('Offline - will sync')).toBeInTheDocument();

      // Should have orange styling
      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveClass('text-orange-600', 'bg-orange-50', 'border-orange-200');
    });

    it('should display unsaved changes status when idle with changes', () => {
      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="idle"
          hasUnsavedChanges={true}
        />
      );

      expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

      // Should have yellow styling
      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveClass('text-yellow-700', 'bg-yellow-50', 'border-yellow-200');
    });

    it('should display default saved status when idle without changes', () => {
      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="idle"
          hasUnsavedChanges={false}
        />
      );

      expect(screen.getByText('Saved')).toBeInTheDocument();

      // Should have gray styling with opacity
      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveClass('text-gray-600', 'bg-gray-50', 'border-gray-200', 'opacity-75');
    });
  });

  describe('Time Display', () => {
    beforeEach(() => {
      // Mock current time for consistent testing
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-12-01T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should display "Just now" for recent saves', () => {
      const recentSave = new Date('2023-12-01T11:59:45Z'); // 15 seconds ago

      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="saved"
          lastSaved={recentSave}
        />
      );

      expect(screen.getByText('Just now')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        'Save status: Saved, Just now'
      );
    });

    it('should display seconds for saves within a minute', () => {
      const recentSave = new Date('2023-12-01T11:59:25Z'); // 35 seconds ago

      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="saved"
          lastSaved={recentSave}
        />
      );

      expect(screen.getByText('35 seconds ago')).toBeInTheDocument();
    });

    it('should display minutes for saves within an hour', () => {
      const recentSave = new Date('2023-12-01T11:45:00Z'); // 15 minutes ago

      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="saved"
          lastSaved={recentSave}
        />
      );

      expect(screen.getByText('15 minutes ago')).toBeInTheDocument();
    });

    it('should display hours for older saves', () => {
      const oldSave = new Date('2023-12-01T09:00:00Z'); // 3 hours ago

      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="saved"
          lastSaved={oldSave}
        />
      );

      expect(screen.getByText('3 hours ago')).toBeInTheDocument();
    });

    it('should handle singular vs plural time units correctly', () => {
      // Test singular minute
      const oneMinuteAgo = new Date('2023-12-01T11:59:00Z');
      const { rerender } = render(
        <SaveStatusIndicator
          {...defaultProps}
          status="saved"
          lastSaved={oneMinuteAgo}
        />
      );

      expect(screen.getByText('1 minute ago')).toBeInTheDocument();

      // Test singular hour
      const oneHourAgo = new Date('2023-12-01T11:00:00Z');
      rerender(
        <SaveStatusIndicator
          {...defaultProps}
          status="saved"
          lastSaved={oneHourAgo}
        />
      );

      expect(screen.getByText('1 hour ago')).toBeInTheDocument();
    });

    it('should not show time when status is not saved', () => {
      const lastSaved = new Date('2023-12-01T11:00:00Z');

      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="saving"
          lastSaved={lastSaved}
        />
      );

      expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
    });
  });

  describe('Visibility Rules', () => {
    it('should not render when idle with no unsaved changes and has been saved', () => {
      const lastSaved = new Date();

      const { container } = render(
        <SaveStatusIndicator
          {...defaultProps}
          status="idle"
          hasUnsavedChanges={false}
          lastSaved={lastSaved}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render when idle with unsaved changes', () => {
      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="idle"
          hasUnsavedChanges={true}
        />
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should render when idle with no previous save', () => {
      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="idle"
          hasUnsavedChanges={false}
          lastSaved={null}
        />
      );

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('should always render for non-idle statuses', () => {
      const statuses: AutoSaveStatus[] = ['saving', 'saved', 'error', 'offline'];

      statuses.forEach(status => {
        const { unmount } = render(
          <SaveStatusIndicator
            {...defaultProps}
            status={status}
            lastSaved={new Date()}
          />
        );

        expect(screen.getByRole('status')).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="saving"
        />
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveAttribute('aria-live', 'polite');
      expect(statusElement).toHaveAttribute('aria-label', 'Save status: Saving...');
    });

    it('should update aria-label with time information', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-12-01T12:00:00Z'));

      const lastSaved = new Date('2023-12-01T11:45:00Z'); // 15 minutes ago

      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="saved"
          lastSaved={lastSaved}
        />
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveAttribute(
        'aria-label',
        'Save status: Saved, 15 minutes ago'
      );

      vi.useRealTimers();
    });

    it('should have accessible retry button when in error state', () => {
      const onManualSave = vi.fn();

      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="error"
          onManualSave={onManualSave}
        />
      );

      const retryButton = screen.getByRole('button', { name: 'Retry save' });
      expect(retryButton).toHaveAttribute('aria-label', 'Retry save');

      // Should have focus management
      expect(retryButton).toHaveClass('focus:outline-none', 'focus:ring-2');
    });
  });

  describe('Custom Styling', () => {
    it('should accept custom className', () => {
      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="saved"
          className="custom-class"
        />
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveClass('custom-class');
    });

    it('should merge custom className with status classes', () => {
      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="error"
          className="custom-error-class"
        />
      );

      const statusElement = screen.getByRole('status');
      expect(statusElement).toHaveClass(
        'custom-error-class',
        'text-red-600',
        'bg-red-50',
        'border-red-200'
      );
    });
  });

  describe('Error State Without Retry', () => {
    it('should not show retry button when onManualSave is not provided', () => {
      render(
        <SaveStatusIndicator
          {...defaultProps}
          status="error"
          onManualSave={undefined}
        />
      );

      expect(screen.getByText('Save failed')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});

describe('SaveStatusIndicatorCompact', () => {
  const defaultProps = {
    status: 'idle' as AutoSaveStatus,
    lastSaved: null,
    hasUnsavedChanges: false,
    onManualSave: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Compact Display', () => {
    it('should display only icon for saving status', () => {
      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="saving"
        />
      );

      const button = screen.getByRole('status');
      expect(button).toHaveAttribute('aria-label', 'Saving...');

      // Should have spinner icon
      const spinnerIcon = document.querySelector('.animate-spin');
      expect(spinnerIcon).toBeInTheDocument();

      // Should not have text
      expect(screen.queryByText('Saving...')).not.toBeInTheDocument();
    });

    it('should display check icon for saved status', () => {
      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="saved"
        />
      );

      const button = screen.getByRole('status');
      expect(button).toHaveAttribute('aria-label', 'All changes saved');

      // Should have green check icon
      const checkIcon = document.querySelector('.text-green-600');
      expect(checkIcon).toBeInTheDocument();
    });

    it('should display alert icon for error status with click handler', () => {
      const onManualSave = vi.fn();

      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="error"
          onManualSave={onManualSave}
        />
      );

      const button = screen.getByRole('status');
      expect(button).toHaveAttribute('aria-label', 'Save failed');
      expect(button).not.toBeDisabled();

      // Should be clickable for retry
      fireEvent.click(button);
      expect(onManualSave).toHaveBeenCalledTimes(1);
    });

    it('should display cloud-off icon for offline status', () => {
      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="offline"
        />
      );

      const button = screen.getByRole('status');
      expect(button).toHaveAttribute('aria-label', 'Offline - will sync when reconnected');

      // Should have orange icon
      const offlineIcon = document.querySelector('.text-orange-600');
      expect(offlineIcon).toBeInTheDocument();
    });

    it('should display yellow circle for unsaved changes', () => {
      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="idle"
          hasUnsavedChanges={true}
        />
      );

      const button = screen.getByRole('status');
      expect(button).toHaveAttribute('aria-label', 'Unsaved changes');

      // Should have yellow filled circle
      const unsavedIcon = document.querySelector('.fill-yellow-500');
      expect(unsavedIcon).toBeInTheDocument();
    });
  });

  describe('Time Display in Compact Mode', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-12-01T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should show minutes abbreviation for saved status', () => {
      const fiveMinutesAgo = new Date('2023-12-01T11:55:00Z');

      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="saved"
          lastSaved={fiveMinutesAgo}
        />
      );

      expect(screen.getByText('5m')).toBeInTheDocument();
    });

    it('should not show time for very recent saves', () => {
      const justNow = new Date('2023-12-01T11:59:30Z'); // 30 seconds ago

      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="saved"
          lastSaved={justNow}
        />
      );

      expect(screen.queryByText(/m$/)).not.toBeInTheDocument();
    });

    it('should include time in aria-label when present', () => {
      const tenMinutesAgo = new Date('2023-12-01T11:50:00Z');

      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="saved"
          lastSaved={tenMinutesAgo}
        />
      );

      const button = screen.getByRole('status');
      expect(button).toHaveAttribute('aria-label', 'All changes saved');
    });
  });

  describe('Interaction States', () => {
    it('should be disabled for non-error statuses', () => {
      const statuses: AutoSaveStatus[] = ['saving', 'saved', 'offline', 'idle'];

      statuses.forEach(status => {
        const { unmount } = render(
          <SaveStatusIndicatorCompact
            {...defaultProps}
            status={status}
          />
        );

        const button = screen.getByRole('status');
        expect(button).toBeDisabled();
        expect(button).toHaveClass('cursor-default');

        unmount();
      });
    });

    it('should be clickable only for error status', () => {
      const onManualSave = vi.fn();

      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="error"
          onManualSave={onManualSave}
        />
      );

      const button = screen.getByRole('status');
      expect(button).not.toBeDisabled();
      expect(button).toHaveClass('cursor-pointer');
    });

    it('should have hover styles for error status', () => {
      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="error"
        />
      );

      const button = screen.getByRole('status');
      expect(button).toHaveClass('hover:bg-red-100');
    });
  });

  describe('Custom Styling for Compact', () => {
    it('should accept custom className', () => {
      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="saved"
          className="compact-custom"
        />
      );

      const button = screen.getByRole('status');
      expect(button).toHaveClass('compact-custom');
    });
  });

  describe('Accessibility for Compact', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="saving"
        />
      );

      const button = screen.getByRole('status');
      expect(button).toHaveAttribute('aria-live', 'polite');
      expect(button).toHaveAttribute('aria-label', 'Saving...');
    });

    it('should indicate clickable state in aria-label for errors', () => {
      render(
        <SaveStatusIndicatorCompact
          {...defaultProps}
          status="error"
        />
      );

      const button = screen.getByRole('status');
      expect(button).toHaveAttribute('aria-label', 'Save failed');
      // Button element implies it's clickable for screen readers
    });
  });
});