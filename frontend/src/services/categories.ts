import api from '@/lib/api';
import { 
  Category, 
  CreateCategoryData, 
  UpdateCategoryData, 
  QueryParams, 
  ApiResponse 
} from '@/types';

export const categoriesService = {
  // Get all categories (public)
  getCategories: async (params: QueryParams = {}): Promise<ApiResponse<Category[]>> => {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString());
      }
    });

    const response = await api.get(`/categories?${searchParams.toString()}`);
    return response.data;
  },

  // Get single category by slug (public)
  getCategoryBySlug: async (slug: string): Promise<Category> => {
    const response = await api.get(`/categories/${slug}`);
    return response.data.data;
  },

  // Get single category by ID (public)
  getCategoryById: async (id: number): Promise<ApiResponse<Category>> => {
    const response = await api.get(`/categories/${id}`);
    return response.data;
  },

  // Admin endpoints
  getAllCategories: async (params: QueryParams = {}): Promise<ApiResponse<Category[]>> => {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString());
      }
    });

    const response = await api.get(`/admin/categories?${searchParams.toString()}`);
    return response.data;
  },

  createCategory: async (data: CreateCategoryData): Promise<ApiResponse<Category>> => {
    const response = await api.post('/categories', data);
    return response.data;
  },

  updateCategory: async (id: number, data: UpdateCategoryData): Promise<ApiResponse<Category>> => {
    const response = await api.put(`/categories/${id}`, data);
    return response.data;
  },

  deleteCategory: async (id: number): Promise<ApiResponse<void>> => {
    const response = await api.delete(`/categories/${id}`);
    return response.data;
  },

  // Bulk operations
  bulkDeleteCategories: async (ids: number[]): Promise<ApiResponse<void>> => {
    const response = await api.delete('/admin/categories/bulk', { data: { ids } });
    return response.data;
  },

  // Get categories with post counts
  getCategoriesWithCounts: async (): Promise<ApiResponse<Category[]>> => {
    const response = await api.get('/categories?include_counts=true');
    return response.data;
  },
}; 