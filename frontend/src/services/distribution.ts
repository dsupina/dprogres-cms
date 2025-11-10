import api from '@/lib/api';
import type {
  DistributionLog,
  DistributionMetrics,
  PublishingSchedule,
  PublishingTarget,
} from '@/types';

export interface SchedulePayload {
  postId: number;
  targetId: number;
  scheduledFor: string;
  status?: PublishingSchedule['status'];
  options?: Record<string, any>;
}

export interface DispatchPayload {
  postId: number;
  targetIds: number[];
  requestAiAssets?: boolean;
  customMessage?: string;
}

export const distributionService = {
  async getTargets(): Promise<PublishingTarget[]> {
    const response = await api.get('/admin/distribution/targets');
    return response.data?.data ?? [];
  },

  async createTarget(payload: Partial<PublishingTarget>): Promise<PublishingTarget> {
    const response = await api.post('/admin/distribution/targets', payload);
    return response.data?.data;
  },

  async updateTarget(id: number, payload: Partial<PublishingTarget>): Promise<PublishingTarget> {
    const response = await api.put(`/admin/distribution/targets/${id}`, payload);
    return response.data?.data;
  },

  async deleteTarget(id: number): Promise<void> {
    await api.delete(`/admin/distribution/targets/${id}`);
  },

  async getSchedules(params: { postId?: number; status?: PublishingSchedule['status'] } = {}): Promise<PublishingSchedule[]> {
    const response = await api.get('/admin/distribution/schedules', { params });
    return response.data?.data ?? [];
  },

  async createSchedule(payload: SchedulePayload): Promise<PublishingSchedule> {
    const body = {
      postId: payload.postId,
      targetId: payload.targetId,
      scheduledFor: payload.scheduledFor,
      status: payload.status,
      options: payload.options,
    };
    const response = await api.post('/admin/distribution/schedules', body);
    return response.data?.data;
  },

  async deleteSchedule(id: number): Promise<void> {
    await api.delete(`/admin/distribution/schedules/${id}`);
  },

  async dispatchSchedule(id: number, payload?: { requestAiAssets?: boolean; customMessage?: string }) {
    const response = await api.post(`/admin/distribution/schedules/${id}/dispatch`, payload ?? {});
    return response.data?.data;
  },

  async dispatch(payload: DispatchPayload) {
    const response = await api.post('/admin/distribution/dispatch', payload);
    return response.data?.data;
  },

  async getMetrics(postId?: number): Promise<DistributionMetrics> {
    const response = await api.get('/admin/distribution/metrics', {
      params: postId ? { postId } : undefined,
    });
    return response.data?.data;
  },

  async getQueue(params: { limit?: number } = {}): Promise<DistributionLog[]> {
    const response = await api.get('/admin/distribution/queue', { params });
    return response.data?.data ?? [];
  },

  async sendFeedback(logId: number, feedback: Record<string, any>): Promise<DistributionLog> {
    const response = await api.post(`/admin/distribution/logs/${logId}/feedback`, { feedback });
    return response.data?.data;
  },

  async retryLog(logId: number, payload?: { dispatch?: boolean }): Promise<any> {
    const response = await api.post(`/admin/distribution/logs/${logId}/retry`, payload ?? {});
    return response.data?.data;
  },
};

export default distributionService;
