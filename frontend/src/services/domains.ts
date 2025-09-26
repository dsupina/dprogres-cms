import { api } from '../lib/api';

export interface Domain {
  id: number;
  hostname: string;
  ip_address?: string | null;
  is_active: boolean;
  is_default: boolean;
  verification_token?: string;
  verified_at?: string | null;
  settings?: any;
  created_at: string;
  updated_at: string;
}

export interface CreateDomainData {
  hostname: string;
  ip_address?: string;
  is_active?: boolean;
  is_default?: boolean;
}

export interface UpdateDomainData {
  hostname?: string;
  ip_address?: string | null;
  is_active?: boolean;
  is_default?: boolean;
  settings?: any;
}

export interface VerificationInstructions {
  domain: string;
  verified: boolean;
  instructions: {
    method: string;
    record_name: string;
    record_value: string;
    ttl: number;
    note: string;
  };
}

class DomainsService {
  async getAll(): Promise<Domain[]> {
    const response = await api.get('/admin/domains');
    return response.data;
  }

  async getById(id: number): Promise<Domain> {
    const response = await api.get(`/admin/domains/${id}`);
    return response.data;
  }

  async create(data: CreateDomainData): Promise<Domain> {
    const response = await api.post('/admin/domains', data);
    return response.data;
  }

  async update(id: number, data: UpdateDomainData): Promise<Domain> {
    const response = await api.put(`/admin/domains/${id}`, data);
    return response.data;
  }

  async delete(id: number): Promise<void> {
    await api.delete(`/admin/domains/${id}`);
  }

  async verify(id: number, token: string): Promise<{ message: string }> {
    const response = await api.post(`/admin/domains/${id}/verify`, { token });
    return response.data;
  }

  async getVerificationInstructions(id: number): Promise<VerificationInstructions> {
    const response = await api.get(`/admin/domains/${id}/verification-instructions`);
    return response.data;
  }

  async clearCache(): Promise<{ message: string }> {
    const response = await api.post('/admin/domains/cache/clear');
    return response.data;
  }
}

export const domainsService = new DomainsService();

// Export convenience functions for compatibility
export const fetchDomains = () => domainsService.getAll();