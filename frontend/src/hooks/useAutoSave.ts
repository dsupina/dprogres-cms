import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { autoSaveApi } from '../services/autoSaveApi';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

interface UseAutoSaveOptions {
  contentType: 'post' | 'page';
  contentId: number;
  content: any;
  interval?: number; // Default: 30000ms (30 seconds)
  enabled?: boolean;
  onSaveStart?: () => void;
  onSaveSuccess?: (version: any) => void;
  onSaveError?: (error: Error) => void;
}

interface UseAutoSaveReturn {
  status: AutoSaveStatus;
  lastSaved: Date | null;
  hasUnsavedChanges: boolean;
  manualSave: () => void;
  error: Error | null;
}

// Helper function to generate content hash
async function generateContentHash(content: any): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(content));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export function useAutoSave({
  contentType,
  contentId,
  content,
  interval = 30000, // 30 seconds default
  enabled = true,
  onSaveStart,
  onSaveSuccess,
  onSaveError
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const contentHashRef = useRef<string | null>(null);
  const lastContentRef = useRef<any>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);

  // Check for existing auto-save on mount
  const { data: latestAutoSave } = useQuery({
    queryKey: ['autosave', 'latest', contentType, contentId],
    queryFn: () => autoSaveApi.getLatestAutoSave(contentType, contentId),
    enabled: enabled && contentId > 0,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  // Auto-save mutation
  const autoSaveMutation = useMutation({
    mutationFn: async (data: any) => {
      const hash = await generateContentHash(data);
      return autoSaveApi.createAutoSave(contentType, contentId, {
        ...data,
        content_hash: hash
      });
    },
    onMutate: () => {
      setStatus('saving');
      setError(null);
      onSaveStart?.();
    },
    onSuccess: (response) => {
      if (response.data) {
        setStatus('saved');
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        contentHashRef.current = response.content_hash;
        retryCountRef.current = 0;
        onSaveSuccess?.(response.data.version);

        // Reset status after 2 seconds
        setTimeout(() => setStatus('idle'), 2000);
      }
    },
    onError: (err: Error) => {
      setError(err);
      setStatus('error');
      onSaveError?.(err);

      // Retry logic with exponential backoff
      if (retryCountRef.current < 3) {
        retryCountRef.current++;
        const retryDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 10000);
        setTimeout(() => {
          if (lastContentRef.current) {
            autoSaveMutation.mutate(lastContentRef.current);
          }
        }, retryDelay);
      }
    }
  });

  // Manual save function
  const manualSave = useCallback(() => {
    if (content && hasUnsavedChanges && !autoSaveMutation.isPending) {
      // Clear any pending auto-save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      lastContentRef.current = content;
      autoSaveMutation.mutate(content);
    }
  }, [content, hasUnsavedChanges, autoSaveMutation]);

  // Check for content changes
  useEffect(() => {
    if (!enabled || !content) return;

    const checkForChanges = async () => {
      const currentHash = await generateContentHash(content);

      if (contentHashRef.current === null) {
        // First load - store the hash
        contentHashRef.current = currentHash;
        lastContentRef.current = content;
      } else if (contentHashRef.current !== currentHash) {
        // Content has changed
        setHasUnsavedChanges(true);
        lastContentRef.current = content;

        // Schedule auto-save
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
          if (isOnline) {
            autoSaveMutation.mutate(content);
          } else {
            // Store in localStorage for offline recovery
            try {
              const offlineKey = `autosave_${contentType}_${contentId}`;
              localStorage.setItem(offlineKey, JSON.stringify({
                content,
                timestamp: new Date().toISOString()
              }));
              setStatus('offline');
            } catch (e) {
              console.error('Failed to save to localStorage:', e);
            }
          }
        }, interval);
      }
    };

    checkForChanges();
  }, [content, enabled, interval, contentType, contentId, isOnline, autoSaveMutation]);

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setStatus('idle');

      // Try to sync offline saves
      const offlineKey = `autosave_${contentType}_${contentId}`;
      const offlineSave = localStorage.getItem(offlineKey);

      if (offlineSave) {
        try {
          const { content: savedContent } = JSON.parse(offlineSave);
          autoSaveMutation.mutate(savedContent);
          localStorage.removeItem(offlineKey);
        } catch (e) {
          console.error('Failed to sync offline save:', e);
        }
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [contentType, contentId, autoSaveMutation]);

  // Recovery on mount - check for unsaved work
  useEffect(() => {
    if (!enabled || contentId <= 0) return;

    const offlineKey = `autosave_${contentType}_${contentId}`;
    const offlineSave = localStorage.getItem(offlineKey);

    if (offlineSave && latestAutoSave?.data?.version) {
      try {
        const { timestamp } = JSON.parse(offlineSave);
        const offlineTime = new Date(timestamp);
        const serverTime = new Date(latestAutoSave.data.version.created_at);

        if (offlineTime > serverTime) {
          // Offline save is newer - notify user
          setHasUnsavedChanges(true);
        }
      } catch (e) {
        console.error('Failed to check offline save:', e);
      }
    }
  }, [enabled, contentId, contentType, latestAutoSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    status,
    lastSaved,
    hasUnsavedChanges,
    manualSave,
    error
  };
}