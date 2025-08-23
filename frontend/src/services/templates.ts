import api from '@/lib/api';
import { ApiResponse } from '@/types';

export interface Template {
  id: number;
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  schema?: any;
  default_data?: any;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateData {
  key: string;
  name: string;
  description?: string;
  enabled?: boolean;
  schema?: any;
  default_data?: any;
}

export interface UpdateTemplateData extends Partial<CreateTemplateData> {}

export const templatesService = {
  list: async (): Promise<ApiResponse<Template[]>> => (await api.get('/admin/templates')).data,
  get: async (id: number): Promise<ApiResponse<Template>> => (await api.get(`/admin/templates/${id}`)).data,
  create: async (data: CreateTemplateData): Promise<ApiResponse<Template>> => (await api.post('/admin/templates', data)).data,
  update: async (id: number, data: UpdateTemplateData): Promise<ApiResponse<Template>> => (await api.put(`/admin/templates/${id}`, data)).data,
  remove: async (id: number): Promise<ApiResponse<void>> => (await api.delete(`/admin/templates/${id}`)).data,
};
