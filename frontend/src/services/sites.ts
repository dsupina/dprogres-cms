import api from '../lib/api';

export interface Site {
  id: number;
  domain_id: number;
  name: string;
  base_path: string;
  title?: string;
  description?: string;
  is_default: boolean;
  is_active: boolean;
  settings?: any;
  domain_hostname?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSiteDto {
  domain_id: number;
  name: string;
  base_path?: string;
  title?: string;
  description?: string;
  is_default?: boolean;
  is_active?: boolean;
  settings?: any;
}

export interface UpdateSiteDto {
  name?: string;
  base_path?: string;
  title?: string;
  description?: string;
  is_default?: boolean;
  is_active?: boolean;
  settings?: any;
}

export interface SiteContext {
  siteId: number;
  siteName: string;
  siteTitle?: string;
  basePath: string;
  domainId: number;
}

// Fetch all sites
export const fetchSites = async (): Promise<Site[]> => {
  const response = await api.get('/admin/sites');
  return response.data;
};

// Fetch sites by domain
export const fetchSitesByDomain = async (domainId: number): Promise<Site[]> => {
  const response = await api.get(`/admin/sites/domain/${domainId}`);
  return response.data;
};

// Get single site
export const fetchSiteById = async (id: number): Promise<Site> => {
  const response = await api.get(`/admin/sites/${id}`);
  return response.data;
};

// Create new site
export const createSite = async (data: CreateSiteDto): Promise<Site> => {
  const response = await api.post('/admin/sites', data);
  return response.data;
};

// Update site
export const updateSite = async (id: number, data: UpdateSiteDto): Promise<Site> => {
  const response = await api.put(`/admin/sites/${id}`, data);
  return response.data;
};

// Delete site
export const deleteSite = async (id: number): Promise<void> => {
  await api.delete(`/admin/sites/${id}`);
};

// Get current site context (for public pages)
export const fetchCurrentSiteContext = async (path?: string): Promise<SiteContext> => {
  const params = path ? { path } : {};
  const response = await api.get('/sites/context/current', { params });
  return response.data;
};