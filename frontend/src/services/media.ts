import api from '@/lib/api';
import { 
  MediaFile, 
  QueryParams, 
  ApiResponse 
} from '@/types';

export const mediaService = {
  // Get all media files
  getMediaFiles: async (params: QueryParams = {}): Promise<ApiResponse<MediaFile[]>> => {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString());
      }
    });

    const response = await api.get(`/media?${searchParams.toString()}`);
    return response.data;
  },

  // Get single media file
  getMediaFile: async (id: number): Promise<ApiResponse<MediaFile>> => {
    const response = await api.get(`/media/${id}`);
    return response.data;
  },

  // Upload file
  uploadFile: async (file: File, altText?: string): Promise<ApiResponse<MediaFile>> => {
    const formData = new FormData();
    formData.append('file', file);
    if (altText) {
      formData.append('alt_text', altText);
    }

    const response = await api.post('/media/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Upload multiple files
  uploadFiles: async (files: File[]): Promise<ApiResponse<MediaFile[]>> => {
    const formData = new FormData();
    files.forEach((file) => {
      formData.append('files', file);
    });

    const response = await api.post('/media/upload/multiple', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Update media file
  updateMediaFile: async (id: number, data: { alt_text?: string }): Promise<ApiResponse<MediaFile>> => {
    const response = await api.put(`/media/${id}`, data);
    return response.data;
  },

  // Delete media file
  deleteMediaFile: async (id: number): Promise<ApiResponse<void>> => {
    const response = await api.delete(`/media/${id}`);
    return response.data;
  },

  // Bulk delete media files
  bulkDeleteMediaFiles: async (ids: number[]): Promise<ApiResponse<void>> => {
    const response = await api.delete('/media/bulk', { data: { ids } });
    return response.data;
  },

  // Get media by type
  getMediaByType: async (type: string, params: QueryParams = {}): Promise<ApiResponse<MediaFile[]>> => {
    const searchParams = new URLSearchParams();
    searchParams.append('type', type);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString());
      }
    });

    const response = await api.get(`/media?${searchParams.toString()}`);
    return response.data;
  },

  // Search media files
  searchMediaFiles: async (query: string, params: QueryParams = {}): Promise<ApiResponse<MediaFile[]>> => {
    const searchParams = new URLSearchParams();
    searchParams.append('search', query);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString());
      }
    });

    const response = await api.get(`/media?${searchParams.toString()}`);
    return response.data;
  },
}; 