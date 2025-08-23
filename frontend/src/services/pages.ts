import api from '@/lib/api';
import { 
  Page, 
  CreatePageData, 
  UpdatePageData, 
  ApiResponse 
} from '@/types';

export const pagesService = {
  // Get all published pages (public)
  getPublicPages: async (): Promise<ApiResponse<Page[]>> => {
    const response = await api.get('/pages');
    return response.data;
  },

  // Get single page by slug (public)
  getPageBySlug: async (slug: string): Promise<Page> => {
    const response = await api.get(`/pages/${slug}`);
    const body = response.data as any;
    return body.page || body.data;
  },

  // Admin endpoints
  getAllPages: async (): Promise<ApiResponse<Page[]>> => {
    const response = await api.get('/admin/pages');
    return response.data;
  },

  getPageById: async (id: number): Promise<ApiResponse<Page>> => {
    const response = await api.get(`/admin/pages/${id}`);
    return response.data;
  },

  createPage: async (data: CreatePageData): Promise<ApiResponse<Page>> => {
    const response = await api.post('/pages', data);
    return response.data;
  },

  updatePage: async (id: number, data: UpdatePageData): Promise<ApiResponse<Page>> => {
    const response = await api.put(`/pages/${id}`, data);
    return response.data;
  },

  deletePage: async (id: number): Promise<ApiResponse<void>> => {
    const response = await api.delete(`/pages/${id}`);
    return response.data;
  },
}; 