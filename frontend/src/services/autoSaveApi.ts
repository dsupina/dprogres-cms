import api from '../lib/api';

export interface AutoSaveRequest {
  title: string;
  content: string;
  excerpt?: string;
  slug?: string;
  data?: any;
  meta_data?: any;
  content_hash?: string;
}

export interface AutoSaveResponse {
  success: boolean;
  data?: {
    version: any;
    content_hash: string;
  };
  message?: string;
  error?: string;
}

export interface LatestAutoSaveResponse {
  success: boolean;
  data?: {
    version: any | null;
    has_newer_manual_save: boolean;
  };
}

export interface AutoSaveStatusResponse {
  success: boolean;
  data?: {
    has_unsaved_changes: boolean;
    latest_version_number: number;
  };
}

export const autoSaveApi = {
  // Create auto-save
  createAutoSave: async (
    contentType: 'post' | 'page',
    contentId: number,
    data: AutoSaveRequest
  ): Promise<AutoSaveResponse> => {
    const response = await api.post(
      `/content/${contentType}/${contentId}/autosave`,
      data
    );
    return response.data;
  },

  // Get latest auto-save
  getLatestAutoSave: async (
    contentType: 'post' | 'page',
    contentId: number
  ): Promise<LatestAutoSaveResponse> => {
    const response = await api.get(
      `/content/${contentType}/${contentId}/autosave/latest`
    );
    return response.data;
  },

  // Check auto-save status
  checkAutoSaveStatus: async (
    contentType: 'post' | 'page',
    contentId: number,
    contentHash: string
  ): Promise<AutoSaveStatusResponse> => {
    const response = await api.get(
      `/content/${contentType}/${contentId}/autosave/status`,
      {
        params: { content_hash: contentHash }
      }
    );
    return response.data;
  },

  // Clean up auto-saves
  cleanupAutoSaves: async (
    contentType: 'post' | 'page',
    contentId: number
  ): Promise<{ success: boolean; message: string }> => {
    const response = await api.delete(
      `/content/${contentType}/${contentId}/autosave/cleanup`
    );
    return response.data;
  }
};