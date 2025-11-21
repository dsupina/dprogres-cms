# SD-001: Infrastructure Setup - Redis & BullMQ

**Epic**: EPIC-002 Social Media Distribution
**Phase**: Phase 1 (MVP)
**Priority**: P0 (Blocker - Required for all distribution features)
**Estimated Effort**: 3 days
**Status**: Not Started
**Dependencies**: None
**Assigned To**: Backend Engineer

---

## Objective

Set up Redis server and BullMQ queue system for asynchronous distribution processing. This foundational infrastructure enables background job processing to meet API performance targets (p95 ≤ 300ms).

---

## Requirements

### Functional Requirements

1. **Redis Setup**:
   - Install and configure Redis 6.2+ (local dev or managed service)
   - Configure persistence (AOF + RDB for durability)
   - Set up connection pooling
   - Configure memory limits and eviction policies

2. **BullMQ Configuration**:
   - Install `bullmq` npm package
   - Create base queue service: `backend/src/services/QueueService.ts`
   - Define job types: `dispatch`, `scheduled_publish`, `retry`, `token_refresh`
   - Configure default options (retry, timeout, concurrency)

3. **Queue Workers**:
   - Create worker processes for job processing
   - Implement graceful shutdown handling
   - Add health check endpoint for queue status

4. **Monitoring**:
   - Set up BullMQ UI (optional, for debugging)
   - Add logging for job lifecycle (queued, processing, completed, failed)
   - Implement dead letter queue for permanently failed jobs

### Non-Functional Requirements

- **Performance**: Support 10+ jobs/second throughput
- **Reliability**: Jobs must not be lost on Redis restart (persistence)
- **Observability**: Log all job state transitions
- **Security**: Redis connection password-protected

---

## Technical Design

### Environment Variables

Add to `.env`:

```env
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password
REDIS_DB=0
REDIS_TLS=false

# BullMQ Configuration
BULLMQ_CONCURRENCY=5
BULLMQ_MAX_RETRIES=3
BULLMQ_BACKOFF_DELAY=5000
```

### File Structure

```
backend/src/
├── services/
│   ├── QueueService.ts         # Queue initialization and job management
│   └── queue/
│       ├── workers/
│       │   ├── DispatchWorker.ts         # Process dispatch jobs
│       │   ├── ScheduledPublishWorker.ts # Process scheduled publications
│       │   └── TokenRefreshWorker.ts     # Background token refresh
│       └── jobs/
│           ├── DispatchJob.ts            # Job type definition
│           ├── ScheduledPublishJob.ts
│           └── TokenRefreshJob.ts
├── utils/
│   └── redis.ts                # Redis client initialization
└── routes/
    └── queue.ts                # Queue monitoring endpoints
```

### QueueService Implementation

```typescript
// backend/src/services/QueueService.ts
import { Queue, Worker, QueueScheduler } from 'bullmq';
import { getRedisConnection } from '../utils/redis';

export interface DispatchJobData {
  scheduleId: number;
  postId: number;
  targetId: number;
  requestAiAssets?: boolean;
  customMessage?: string;
}

export interface ScheduledPublishJobData {
  scheduleId: number;
  scheduledFor: Date;
}

export interface TokenRefreshJobData {
  connectionId: number;
}

export class QueueService {
  private dispatchQueue: Queue<DispatchJobData>;
  private scheduledPublishQueue: Queue<ScheduledPublishJobData>;
  private tokenRefreshQueue: Queue<TokenRefreshJobData>;

  constructor() {
    const connection = getRedisConnection();

    // Initialize queues
    this.dispatchQueue = new Queue('distribution:dispatch', { connection });
    this.scheduledPublishQueue = new Queue('distribution:scheduled', { connection });
    this.tokenRefreshQueue = new Queue('distribution:token-refresh', { connection });

    // Initialize queue schedulers (for delayed/repeatable jobs)
    new QueueScheduler('distribution:dispatch', { connection });
    new QueueScheduler('distribution:scheduled', { connection });
    new QueueScheduler('distribution:token-refresh', { connection });
  }

  async addDispatchJob(data: DispatchJobData, opts: JobOptions = {}) {
    return this.dispatchQueue.add('dispatch', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s, 25s, 125s
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 500,     // Keep last 500 failed jobs
      ...opts,
    });
  }

  async addScheduledPublishJob(data: ScheduledPublishJobData, scheduledFor: Date) {
    return this.scheduledPublishQueue.add('scheduled-publish', data, {
      delay: scheduledFor.getTime() - Date.now(),
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }

  async addTokenRefreshJob(data: TokenRefreshJobData, repeatEvery: number = 86400000) {
    // Repeat every 24 hours by default
    return this.tokenRefreshQueue.add('token-refresh', data, {
      repeat: { every: repeatEvery },
      attempts: 5, // More retries for critical token refresh
    });
  }

  // Queue status methods
  async getQueueStatus(queueName: string) {
    const queue = this.getQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  private getQueue(name: string): Queue {
    switch (name) {
      case 'dispatch': return this.dispatchQueue;
      case 'scheduled': return this.scheduledPublishQueue;
      case 'token-refresh': return this.tokenRefreshQueue;
      default: throw new Error(`Unknown queue: ${name}`);
    }
  }

  async close() {
    await this.dispatchQueue.close();
    await this.scheduledPublishQueue.close();
    await this.tokenRefreshQueue.close();
  }
}

export default new QueueService();
```

### Redis Client Initialization

```typescript
// backend/src/utils/redis.ts
import { Redis } from 'ioredis';

let redisClient: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis connected');
    });
  }

  return redisClient;
}

export async function closeRedisConnection() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
```

### Worker Base Template

```typescript
// backend/src/services/queue/workers/DispatchWorker.ts
import { Worker, Job } from 'bullmq';
import { getRedisConnection } from '../../../utils/redis';
import DistributionService from '../../DistributionService';
import type { DispatchJobData } from '../../QueueService';

const distributionService = new DistributionService();

export function startDispatchWorker() {
  const worker = new Worker<DispatchJobData>(
    'distribution:dispatch',
    async (job: Job<DispatchJobData>) => {
      console.log(`Processing dispatch job ${job.id}:`, job.data);

      try {
        const result = await distributionService.dispatchSchedule(
          job.data.scheduleId,
          {
            requestAiAssets: job.data.requestAiAssets,
            customMessage: job.data.customMessage,
          }
        );

        console.log(`Dispatch job ${job.id} completed successfully`);
        return result;
      } catch (error: any) {
        console.error(`Dispatch job ${job.id} failed:`, error.message);
        throw error; // Will trigger retry logic
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: parseInt(process.env.BULLMQ_CONCURRENCY || '5'),
    }
  );

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed with error:`, err.message);
  });

  return worker;
}
```

### Health Check Endpoint

```typescript
// backend/src/routes/queue.ts
import express from 'express';
import { authenticateToken } from '../middleware/auth';
import queueService from '../services/QueueService';

const router = express.Router();

router.get('/health', authenticateToken, async (req, res) => {
  try {
    const [dispatch, scheduled, tokenRefresh] = await Promise.all([
      queueService.getQueueStatus('dispatch'),
      queueService.getQueueStatus('scheduled'),
      queueService.getQueueStatus('token-refresh'),
    ]);

    res.json({
      status: 'healthy',
      queues: {
        dispatch,
        scheduled,
        tokenRefresh,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
    });
  }
});

export default router;
```

---

## Acceptance Criteria

- [ ] Redis is running and accessible from backend (test with `redis-cli ping`)
- [ ] BullMQ queues are created: `distribution:dispatch`, `distribution:scheduled`, `distribution:token-refresh`
- [ ] `QueueService.addDispatchJob()` adds jobs to dispatch queue
- [ ] `DispatchWorker` processes jobs and logs success/failure
- [ ] Jobs retry 3 times with exponential backoff (5s, 25s, 125s) on failure
- [ ] Health check endpoint `/api/queue/health` returns queue status
- [ ] Dead letter queue captures jobs that fail after max retries
- [ ] Queue persists jobs across Redis restarts (AOF persistence enabled)
- [ ] Worker gracefully shuts down on SIGTERM (finishes in-progress jobs)
- [ ] Unit tests for `QueueService` (add, get status, close)
- [ ] Integration test: Add job, process job, verify result in database

---

## Testing

### Unit Tests (`backend/src/__tests__/services/QueueService.test.ts`)

```typescript
describe('QueueService', () => {
  it('should add dispatch job to queue', async () => {
    const job = await queueService.addDispatchJob({
      scheduleId: 1,
      postId: 1,
      targetId: 1,
    });
    expect(job.id).toBeDefined();
  });

  it('should get queue status', async () => {
    const status = await queueService.getQueueStatus('dispatch');
    expect(status).toHaveProperty('waiting');
    expect(status).toHaveProperty('active');
  });
});
```

### Integration Test (Manual)

```bash
# Start Redis
redis-server

# Start worker
npm run worker:dispatch

# Add test job via API
curl -X POST http://localhost:5000/api/admin/distribution/dispatch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"postId": 1, "connectionIds": [1]}'

# Check queue status
curl http://localhost:5000/api/queue/health \
  -H "Authorization: Bearer <token>"
```

---

## Documentation

- [ ] Update `CLAUDE.md` with Redis setup instructions
- [ ] Add environment variables to `.env.example`
- [ ] Document queue job types and data structures
- [ ] Create operational runbook for Redis monitoring

---

## Deployment Notes

### Local Development

```bash
# Install Redis (macOS)
brew install redis
brew services start redis

# Install Redis (Ubuntu)
sudo apt-get install redis-server
sudo systemctl start redis

# Install Redis (Docker)
docker run -d -p 6379:6379 --name redis redis:7-alpine

# Install dependencies
npm install bullmq ioredis @types/ioredis
```

### Production

- **Managed Redis**: Use Upstash, Redis Cloud, or AWS ElastiCache
- **Configuration**: Enable AOF + RDB persistence, set maxmemory policy
- **Monitoring**: Set up CloudWatch/Datadog alerts for queue depth, failed jobs
- **Scaling**: If queue depth grows, increase worker concurrency or scale horizontally

---

**Created**: 2025-01-21
**Last Updated**: 2025-01-21
