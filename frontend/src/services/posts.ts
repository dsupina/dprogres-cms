import api from '@/lib/api';
import { 
  Post, 
  CreatePostData, 
  UpdatePostData, 
  QueryParams, 
  ApiResponse 
} from '@/types';

export const postsService = {
  // Get all published posts (public) - general method
  getPosts: async (params: QueryParams = {}): Promise<ApiResponse<Post[]>> => {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString());
      }
    });

    const response = await api.get(`/posts?${searchParams.toString()}`);
    const body = response.data as any;
    return { posts: body.data, pagination: body.pagination, total: body.pagination?.totalCount } as unknown as ApiResponse<Post[]>;
  },

  // Get all published posts (public) - alias for backward compatibility
  getPublicPosts: async (params: QueryParams = {}): Promise<ApiResponse<Post[]>> => {
    return postsService.getPosts(params);
  },

  // Get single post by slug (public)
  getPostBySlug: async (slug: string): Promise<Post> => {
    const response = await api.get(`/posts/${slug}`);
    return response.data.post || response.data.data;
  },

  // Get related posts
  getRelatedPosts: async (postId: number, limit: number = 3): Promise<Post[]> => {
    const response = await api.get(`/posts/${postId}/related?limit=${limit}`);
    return response.data.data;
  },

  // Admin endpoints
  getAllPosts: async (params: QueryParams = {}): Promise<ApiResponse<Post[]>> => {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString());
      }
    });

    const response = await api.get(`/admin/posts?${searchParams.toString()}`);
    return response.data;
  },

  getPostById: async (id: number): Promise<ApiResponse<Post>> => {
    const response = await api.get(`/admin/posts/${id}`);
    return response.data;
  },

  createPost: async (data: CreatePostData): Promise<ApiResponse<Post>> => {
    const response = await api.post('/posts', data);
    return response.data;
  },

  updatePost: async (id: number, data: UpdatePostData): Promise<ApiResponse<Post>> => {
    const response = await api.put(`/posts/${id}`, data);
    return response.data;
  },

  deletePost: async (id: number): Promise<ApiResponse<void>> => {
    const response = await api.delete(`/posts/${id}`);
    return response.data;
  },

  // Bulk operations
  bulkUpdatePosts: async (ids: number[], data: Partial<UpdatePostData>): Promise<ApiResponse<void>> => {
    const response = await api.put('/admin/posts/bulk', { ids, ...data });
    return response.data;
  },

  bulkDeletePosts: async (ids: number[]): Promise<ApiResponse<void>> => {
    const response = await api.delete('/admin/posts/bulk', { data: { ids } });
    return response.data;
  },

  // Featured posts
  getFeaturedPosts: async (limit: number = 5): Promise<ApiResponse<Post[]>> => {
    const resp = await api.get(`/posts?featured=true&limit=${limit}`);
    const body = resp.data as any;
    return { posts: body.data, pagination: body.pagination } as unknown as ApiResponse<Post[]>;
  },

  // Recent posts
  getRecentPosts: async (limit: number = 5): Promise<ApiResponse<Post[]>> => {
    const resp = await api.get(`/posts?limit=${limit}`);
    const body = resp.data as any;
    return { posts: body.data, pagination: body.pagination } as unknown as ApiResponse<Post[]>;
  },

  // Search posts
  searchPosts: async (query: string, params: QueryParams = {}): Promise<ApiResponse<Post[]>> => {
    const searchParams = new URLSearchParams();
    searchParams.append('search', query);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString());
      }
    });

    const response = await api.get(`/posts?${searchParams.toString()}`);
    return response.data;
  },
}; 