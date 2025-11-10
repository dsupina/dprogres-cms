import { useQuery } from '@tanstack/react-query';
import { distributionService } from '@/services/distribution';
import type { DistributionMetrics, DistributionLog, PublishingSchedule, PublishingTarget } from '@/types';

export function useDistributionMetrics(postId?: number) {
  return useQuery<DistributionMetrics>({
    queryKey: ['distribution-metrics', postId ?? 'all'],
    queryFn: () => distributionService.getMetrics(postId),
    staleTime: 60_000,
  });
}

export function useDistributionQueue(limit = 50) {
  return useQuery<DistributionLog[]>({
    queryKey: ['distribution-queue', limit],
    queryFn: () => distributionService.getQueue({ limit }),
    refetchInterval: 30_000,
  });
}

export function usePublishingTargets() {
  return useQuery<PublishingTarget[]>({
    queryKey: ['distribution-targets'],
    queryFn: () => distributionService.getTargets(),
    staleTime: 5 * 60_000,
  });
}

export function usePublishingSchedules(postId?: number) {
  return useQuery<PublishingSchedule[]>({
    queryKey: ['distribution-schedules', postId ?? 'all'],
    queryFn: () => distributionService.getSchedules(postId ? { postId } : {}),
    enabled: typeof postId === 'number' && !Number.isNaN(postId),
  });
}
