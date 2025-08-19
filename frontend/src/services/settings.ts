import api from '../lib/api';

export type SiteSettings = Record<string, string>;

export const settingsService = {
  async getSettings() {
    const resp = await api.get('/settings', { headers: { 'Cache-Control': 'no-cache' } });
    const data = resp.data as SiteSettings;
    // Normalize client-side too
    if (data.site_name && !data.site_title) data.site_title = data.site_name;
    return data;
  },

  async updateSettings(settings: SiteSettings) {
    // Ensure site_title mirrors site_name for backward compatibility
    const payload = { ...settings };
    if (payload.site_name && !payload.site_title) {
      payload.site_title = payload.site_name;
    }
    const resp = await api.put('/settings', { settings: payload });
    return resp.data as { message: string };
  },
};


