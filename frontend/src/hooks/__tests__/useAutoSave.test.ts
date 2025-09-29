/**
 * useAutoSave Hook Unit Tests
 *
 * Comprehensive tests for the auto-save hook including:
 * - Auto-save triggering and timing
 * - Content change detection via hash comparison
 * - Network status handling and offline support
 * - Error handling and retry logic
 * - Manual save functionality
 * - localStorage integration for offline mode
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAutoSave, AutoSaveStatus } from '../useAutoSave';
import { autoSaveApi } from '../../services/autoSaveApi';
import React from 'react';

// Mock the autoSaveApi
jest.mock('../../services/autoSaveApi', () => ({
  autoSaveApi: {
    createAutoSave: jest.fn(),
    getLatestAutoSave: jest.fn(),
    checkAutoSaveStatus: jest.fn(),
    cleanupAutoSaves: jest.fn(),
  },
}));

// Mock crypto.subtle for content hash generation
const mockDigest = jest.fn();
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: mockDigest,
    },
  },
});

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
};
Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
});

// Mock navigator.onLine
Object.defineProperty(global, 'navigator', {
  value: {
    onLine: true,
  },
  writable: true,
});

// Mock window event listeners
const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();
Object.defineProperty(global, 'window', {
  value: {
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
  },
});

const mockAutoSaveApi = autoSaveApi as jest.Mocked<typeof autoSaveApi>;

describe('useAutoSave Hook', () => {
  let queryClient: QueryClient;

  const defaultProps = {
    contentType: 'post' as const,
    contentId: 1,
    content: {
      title: 'Test Post',
      content: 'Test content',
      excerpt: 'Test excerpt',
    },
    interval: 1000, // Short interval for testing
    enabled: true,
  };

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Reset mocks
    jest.clearAllMocks();

    // Setup default mocks
    mockDigest.mockResolvedValue(
      new ArrayBuffer(32) // Mock SHA-256 hash
    );

    mockAutoSaveApi.getLatestAutoSave.mockResolvedValue({
      success: true,
      data: {
        version: null,
        has_newer_manual_save: false,
      },
    });

    mockAutoSaveApi.createAutoSave.mockResolvedValue({
      success: true,
      data: {
        version: {
          id: 123,
          version_number: 5,
          version_type: 'auto_save',
        },
        content_hash: 'mock_hash_123',
      },
    });

    // Reset navigator.onLine
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true,
    });

    // Clear localStorage mocks
    mockLocalStorage.getItem.mockReturnValue(null);
    mockLocalStorage.setItem.mockImplementation(() => {});
    mockLocalStorage.removeItem.mockImplementation(() => {});
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('Basic Functionality', () => {
    it('should initialize with idle status', () => {
      const { result } = renderHook(() => useAutoSave(defaultProps), { wrapper });

      expect(result.current.status).toBe('idle');
      expect(result.current.hasUnsavedChanges).toBe(false);
      expect(result.current.lastSaved).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should detect content changes and set unsaved changes flag', async () => {
      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: defaultProps,
        }
      );

      // Wait for initial hash to be set
      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      // Change content
      const newContent = {
        ...defaultProps.content,
        title: 'Updated Title',
      };

      rerender({ ...defaultProps, content: newContent });

      await waitFor(() => {
        expect(result.current.hasUnsavedChanges).toBe(true);
      });
    });

    it('should trigger auto-save after content change', async () => {
      jest.useFakeTimers();

      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: defaultProps,
        }
      );

      // Change content
      const newContent = {
        ...defaultProps.content,
        title: 'Updated Title',
      };

      rerender({ ...defaultProps, content: newContent });

      // Fast-forward to trigger auto-save
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(mockAutoSaveApi.createAutoSave).toHaveBeenCalledWith(
          'post',
          1,
          expect.objectContaining({
            title: 'Updated Title',
            content_hash: expect.any(String),
          })
        );
      });

      jest.useRealTimers();
    });

    it('should update status during save operation', async () => {
      jest.useFakeTimers();

      // Mock slow API response
      let resolveApiCall: (value: any) => void;
      const apiPromise = new Promise((resolve) => {
        resolveApiCall = resolve;
      });
      mockAutoSaveApi.createAutoSave.mockReturnValue(apiPromise as any);

      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: defaultProps,
        }
      );

      // Change content and trigger save
      const newContent = { ...defaultProps.content, title: 'Updated' };
      rerender({ ...defaultProps, content: newContent });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('saving');
      });

      // Resolve the API call
      act(() => {
        resolveApiCall!({
          success: true,
          data: {
            version: { id: 123 },
            content_hash: 'new_hash',
          },
        });
      });

      await waitFor(() => {
        expect(result.current.status).toBe('saved');
        expect(result.current.hasUnsavedChanges).toBe(false);
      });

      jest.useRealTimers();
    });
  });

  describe('Manual Save', () => {
    it('should trigger manual save when called', async () => {
      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: defaultProps,
        }
      );

      // Change content to create unsaved changes
      const newContent = { ...defaultProps.content, title: 'Manual Save Test' };
      rerender({ ...defaultProps, content: newContent });

      await waitFor(() => {
        expect(result.current.hasUnsavedChanges).toBe(true);
      });

      // Trigger manual save
      act(() => {
        result.current.manualSave();
      });

      await waitFor(() => {
        expect(mockAutoSaveApi.createAutoSave).toHaveBeenCalledWith(
          'post',
          1,
          expect.objectContaining({
            title: 'Manual Save Test',
          })
        );
      });
    });

    it('should not trigger manual save when no unsaved changes', () => {
      const { result } = renderHook(() => useAutoSave(defaultProps), { wrapper });

      act(() => {
        result.current.manualSave();
      });

      expect(mockAutoSaveApi.createAutoSave).not.toHaveBeenCalled();
    });

    it('should cancel pending auto-save when manual save is triggered', async () => {
      jest.useFakeTimers();

      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: defaultProps,
        }
      );

      // Change content
      const newContent = { ...defaultProps.content, title: 'Test' };
      rerender({ ...defaultProps, content: newContent });

      // Advance time partially
      act(() => {
        jest.advanceTimersByTime(500); // Half the interval
      });

      // Trigger manual save
      act(() => {
        result.current.manualSave();
      });

      // Advance time to where auto-save would have triggered
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        // Should only be called once (manual save)
        expect(mockAutoSaveApi.createAutoSave).toHaveBeenCalledTimes(1);
      });

      jest.useRealTimers();
    });
  });

  describe('Error Handling and Retry Logic', () => {
    it('should handle save errors and set error status', async () => {
      jest.useFakeTimers();

      const saveError = new Error('Save failed');
      mockAutoSaveApi.createAutoSave.mockRejectedValue(saveError);

      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: defaultProps,
        }
      );

      // Change content and trigger save
      const newContent = { ...defaultProps.content, title: 'Error Test' };
      rerender({ ...defaultProps, content: newContent });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('error');
        expect(result.current.error).toEqual(saveError);
      });

      jest.useRealTimers();
    });

    it('should retry failed saves with exponential backoff', async () => {
      jest.useFakeTimers();

      // First call fails, second succeeds
      mockAutoSaveApi.createAutoSave
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce({
          success: true,
          data: {
            version: { id: 123 },
            content_hash: 'retry_hash',
          },
        });

      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: defaultProps,
        }
      );

      // Change content and trigger save
      const newContent = { ...defaultProps.content, title: 'Retry Test' };
      rerender({ ...defaultProps, content: newContent });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Wait for first failure
      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      // Advance time for retry
      act(() => {
        jest.advanceTimersByTime(2000); // First retry after 2 seconds
      });

      await waitFor(() => {
        expect(result.current.status).toBe('saved');
        expect(mockAutoSaveApi.createAutoSave).toHaveBeenCalledTimes(2);
      });

      jest.useRealTimers();
    });

    it('should stop retrying after maximum attempts', async () => {
      jest.useFakeTimers();

      mockAutoSaveApi.createAutoSave.mockRejectedValue(new Error('Persistent failure'));

      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: defaultProps,
        }
      );

      // Change content and trigger save
      const newContent = { ...defaultProps.content, title: 'Max Retry Test' };
      rerender({ ...defaultProps, content: newContent });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Wait for initial failure
      await waitFor(() => {
        expect(result.current.status).toBe('error');
      });

      // Advance through all retry attempts
      act(() => {
        jest.advanceTimersByTime(2000); // First retry
      });
      act(() => {
        jest.advanceTimersByTime(4000); // Second retry
      });
      act(() => {
        jest.advanceTimersByTime(8000); // Third retry
      });
      act(() => {
        jest.advanceTimersByTime(10000); // Should not retry anymore
      });

      await waitFor(() => {
        // Should have tried 4 times total (initial + 3 retries)
        expect(mockAutoSaveApi.createAutoSave).toHaveBeenCalledTimes(4);
      });

      jest.useRealTimers();
    });
  });

  describe('Offline Support', () => {
    it('should store content in localStorage when offline', async () => {
      jest.useFakeTimers();

      // Set offline
      Object.defineProperty(global, 'navigator', {
        value: { onLine: false },
        writable: true,
      });

      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: defaultProps,
        }
      );

      // Change content
      const newContent = { ...defaultProps.content, title: 'Offline Test' };
      rerender({ ...defaultProps, content: newContent });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('offline');
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'autosave_post_1',
          expect.stringContaining('Offline Test')
        );
      });

      jest.useRealTimers();
    });

    it('should sync offline changes when coming back online', async () => {
      const offlineSave = {
        content: { title: 'Offline Content' },
        timestamp: new Date().toISOString(),
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(offlineSave));

      const { result } = renderHook(() => useAutoSave(defaultProps), { wrapper });

      // Simulate coming online
      const onlineHandler = mockAddEventListener.mock.calls.find(
        call => call[0] === 'online'
      )?.[1];

      expect(onlineHandler).toBeDefined();

      act(() => {
        onlineHandler();
      });

      await waitFor(() => {
        expect(mockAutoSaveApi.createAutoSave).toHaveBeenCalledWith(
          'post',
          1,
          expect.objectContaining({
            title: 'Offline Content',
          })
        );
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('autosave_post_1');
      });
    });

    it('should handle localStorage errors gracefully', async () => {
      jest.useFakeTimers();

      // Mock localStorage error
      mockLocalStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      // Set offline
      Object.defineProperty(global, 'navigator', {
        value: { onLine: false },
        writable: true,
      });

      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: defaultProps,
        }
      );

      // Change content
      const newContent = { ...defaultProps.content, title: 'Storage Error Test' };
      rerender({ ...defaultProps, content: newContent });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Should not crash despite localStorage error
      await waitFor(() => {
        expect(result.current.status).toBe('offline');
      });

      jest.useRealTimers();
    });
  });

  describe('Offline Recovery', () => {
    it('should check for offline saves on mount', async () => {
      const offlineSave = {
        content: { title: 'Recovered Content' },
        timestamp: new Date(Date.now() - 1000).toISOString(),
      };

      const latestAutoSave = {
        success: true,
        data: {
          version: {
            created_at: new Date(Date.now() - 2000).toISOString(),
          },
          has_newer_manual_save: false,
        },
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(offlineSave));
      mockAutoSaveApi.getLatestAutoSave.mockResolvedValue(latestAutoSave);

      const { result } = renderHook(() => useAutoSave(defaultProps), { wrapper });

      await waitFor(() => {
        expect(result.current.hasUnsavedChanges).toBe(true);
      });
    });

    it('should not flag unsaved changes if server save is newer', async () => {
      const offlineSave = {
        content: { title: 'Old Offline Content' },
        timestamp: new Date(Date.now() - 2000).toISOString(),
      };

      const latestAutoSave = {
        success: true,
        data: {
          version: {
            created_at: new Date(Date.now() - 1000).toISOString(),
          },
          has_newer_manual_save: false,
        },
      };

      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(offlineSave));
      mockAutoSaveApi.getLatestAutoSave.mockResolvedValue(latestAutoSave);

      const { result } = renderHook(() => useAutoSave(defaultProps), { wrapper });

      await waitFor(() => {
        expect(result.current.hasUnsavedChanges).toBe(false);
      });
    });
  });

  describe('Configuration and Control', () => {
    it('should respect enabled flag', () => {
      const { result } = renderHook(
        () => useAutoSave({ ...defaultProps, enabled: false }),
        { wrapper }
      );

      // Should not fetch latest auto-save when disabled
      expect(mockAutoSaveApi.getLatestAutoSave).not.toHaveBeenCalled();
    });

    it('should use custom interval', async () => {
      jest.useFakeTimers();

      const customInterval = 5000;
      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: { ...defaultProps, interval: customInterval },
        }
      );

      // Change content
      const newContent = { ...defaultProps.content, title: 'Custom Interval Test' };
      rerender({ ...defaultProps, content: newContent, interval: customInterval });

      // Should not trigger at default interval
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(mockAutoSaveApi.createAutoSave).not.toHaveBeenCalled();

      // Should trigger at custom interval
      act(() => {
        jest.advanceTimersByTime(4000);
      });

      await waitFor(() => {
        expect(mockAutoSaveApi.createAutoSave).toHaveBeenCalled();
      });

      jest.useRealTimers();
    });

    it('should call lifecycle callbacks', async () => {
      const onSaveStart = jest.fn();
      const onSaveSuccess = jest.fn();
      const onSaveError = jest.fn();

      jest.useFakeTimers();

      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: {
            ...defaultProps,
            onSaveStart,
            onSaveSuccess,
            onSaveError,
          },
        }
      );

      // Change content
      const newContent = { ...defaultProps.content, title: 'Callback Test' };
      rerender({
        ...defaultProps,
        content: newContent,
        onSaveStart,
        onSaveSuccess,
        onSaveError,
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(onSaveStart).toHaveBeenCalled();
        expect(onSaveSuccess).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 123,
            version_type: 'auto_save',
          })
        );
      });

      jest.useRealTimers();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup timeouts on unmount', () => {
      jest.useFakeTimers();

      const { unmount } = renderHook(() => useAutoSave(defaultProps), { wrapper });

      unmount();

      // Should not have any active timers
      expect(jest.getTimerCount()).toBe(0);

      jest.useRealTimers();
    });

    it('should remove event listeners on unmount', () => {
      const { unmount } = renderHook(() => useAutoSave(defaultProps), { wrapper });

      unmount();

      expect(mockRemoveEventListener).toHaveBeenCalledWith('online', expect.any(Function));
      expect(mockRemoveEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
    });
  });

  describe('Content Hash Generation', () => {
    it('should generate consistent hashes for same content', async () => {
      // Mock consistent hash output
      const mockHashBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      mockDigest.mockResolvedValue(mockHashBytes.buffer);

      const { result, rerender } = renderHook(
        (props) => useAutoSave(props),
        {
          wrapper,
          initialProps: defaultProps,
        }
      );

      // Wait for initial hash
      await waitFor(() => {
        expect(result.current.status).toBe('idle');
      });

      // Change content to same value
      const sameContent = { ...defaultProps.content };
      rerender({ ...defaultProps, content: sameContent });

      await waitFor(() => {
        // Should not have unsaved changes for identical content
        expect(result.current.hasUnsavedChanges).toBe(false);
      });
    });

    it('should handle hash generation errors', async () => {
      mockDigest.mockRejectedValue(new Error('Hash generation failed'));

      const { result } = renderHook(() => useAutoSave(defaultProps), { wrapper });

      // Should still function despite hash errors
      expect(result.current.status).toBe('idle');
    });
  });
});