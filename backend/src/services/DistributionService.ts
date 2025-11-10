import AiAuthorService from './AiAuthorService';
import {
  createDistributionLog,
  createPublishingSchedule,
  getDistributionLogById,
  getPublishingScheduleById,
  getPublishingTargetById,
  markLogForRetry,
  recordDistributionFeedback,
  updateDistributionLog,
  updatePublishingScheduleStatus,
  type DistributionLog,
  type PublishingSchedule,
  type PublishingTarget,
} from '../db/distribution';
import { query } from '../utils/database';

interface DispatchResult {
  schedule: PublishingSchedule;
  log: DistributionLog;
}

interface DispatchOptions {
  requestAiAssets?: boolean;
  customMessage?: string;
}

interface PostRecord {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  tags: Array<{ name: string }>;
}

export default class DistributionService {
  private aiAuthor: AiAuthorService;

  constructor(aiAuthor = new AiAuthorService()) {
    this.aiAuthor = aiAuthor;
  }

  async dispatchSchedule(scheduleId: number, options: DispatchOptions = {}): Promise<DispatchResult> {
    const schedule = await getPublishingScheduleById(scheduleId);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    const target = await getPublishingTargetById(schedule.target_id);
    if (!target || !target.is_active) {
      throw new Error('Publishing target is inactive or missing');
    }

    const post = await this.getPost(schedule.post_id);
    if (!post) {
      throw new Error('Post not found');
    }

    await updatePublishingScheduleStatus(scheduleId, {
      status: 'queued',
      dispatched_at: new Date(),
      last_error: null,
    });

    const payload = await this.buildPayload(target, post, {
      requestAiAssets: options.requestAiAssets ?? this.shouldRequestAi(schedule.options),
      customMessage: options.customMessage ?? schedule.options?.customMessage,
    });

    const result = await this.sendToChannel(target, payload);

    const log = await createDistributionLog({
      schedule_id: schedule.id,
      post_id: schedule.post_id,
      target_id: schedule.target_id,
      status: result.success ? 'sent' : 'failed',
      payload,
      response: result.response,
      error: result.error ?? null,
    });

    await updatePublishingScheduleStatus(schedule.id, {
      status: result.success ? 'sent' : 'failed',
      dispatched_at: new Date(),
      last_error: result.error ?? null,
      dispatch_payload: payload,
    });

    const refreshedSchedule = await getPublishingScheduleById(schedule.id);
    if (!refreshedSchedule) {
      throw new Error('Failed to refresh schedule after dispatch');
    }

    return {
      schedule: refreshedSchedule,
      log,
    };
  }

  async dispatchImmediate(postId: number, targetId: number, options: DispatchOptions = {}): Promise<DispatchResult> {
    const schedule = await createPublishingSchedule({
      post_id: postId,
      target_id: targetId,
      scheduled_for: new Date(),
      status: 'queued',
      options,
    });

    return this.dispatchSchedule(schedule.id, options);
  }

  async resendFromLog(logId: number, dispatchImmediately = true): Promise<DispatchResult | null> {
    const log = await getDistributionLogById(logId);
    if (!log) {
      return null;
    }

    const retryLog = await markLogForRetry(logId);
    if (!retryLog || !retryLog.schedule_id) {
      return null;
    }

    if (!dispatchImmediately) {
      return {
        schedule: (await getPublishingScheduleById(retryLog.schedule_id))!,
        log: retryLog,
      };
    }

    return this.dispatchSchedule(retryLog.schedule_id, {
      requestAiAssets: this.shouldRequestAi(retryLog.feedback),
    });
  }

  async updateFeedback(logId: number, feedback: Record<string, any>): Promise<DistributionLog | null> {
    const updated = await recordDistributionFeedback(logId, feedback);
    if (!updated) {
      return null;
    }

    if (feedback?.errorHint) {
      await updateDistributionLog(logId, {
        error: feedback.errorHint,
      });
    }

    return getDistributionLogById(logId);
  }

  private shouldRequestAi(source?: Record<string, any> | null): boolean {
    if (!source) {
      return true;
    }
    if (typeof source.requestAiAssets === 'boolean') {
      return source.requestAiAssets;
    }
    return true;
  }

  private async getPost(postId: number): Promise<PostRecord | null> {
    const result = await query(
      `SELECT p.id, p.title, p.slug, p.excerpt, p.content,
              COALESCE(JSON_AGG(JSON_BUILD_OBJECT('name', t.name)) FILTER (WHERE t.id IS NOT NULL), '[]') AS tags
       FROM posts p
       LEFT JOIN post_tags pt ON pt.post_id = p.id
       LEFT JOIN tags t ON t.id = pt.tag_id
       WHERE p.id = $1
       GROUP BY p.id`,
      [postId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: Number(row.id),
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      content: row.content,
      tags: Array.isArray(row.tags) ? row.tags : [],
    };
  }

  private async buildPayload(target: PublishingTarget, post: PostRecord, options: DispatchOptions): Promise<Record<string, any>> {
    const baseUrl = process.env.PUBLIC_SITE_URL || process.env.SITE_URL || '';
    const permalink = post.slug ? `${baseUrl}/blog/${post.slug}` : baseUrl;

    let excerpt = post.excerpt ?? '';
    let hashtags: string[] = [];

    if (options.requestAiAssets) {
      excerpt = await this.aiAuthor.generateExcerpt(post, { channel: target.channel });
      hashtags = await this.aiAuthor.generateHashtags(post, { channel: target.channel });
    }

    const payload: Record<string, any> = {
      title: post.title,
      url: permalink,
      channel: target.channel,
      excerpt,
      hashtags,
      target: {
        id: target.id,
        name: target.name,
      },
      customMessage: options.customMessage,
    };

    if (target.default_payload) {
      payload.defaults = target.default_payload;
    }

    if (target.channel === 'twitter') {
      payload.tweet = this.composeTweet(post.title, excerpt, hashtags, permalink, options.customMessage);
    }

    if (target.channel === 'email') {
      payload.subject = post.title;
      payload.previewText = excerpt;
    }

    return payload;
  }

  private composeTweet(title: string, excerpt: string, hashtags: string[], url: string, customMessage?: string): string {
    const parts = [customMessage || title, excerpt, url, hashtags.join(' ')].filter(Boolean);
    const tweet = parts.join(' ').trim();
    return tweet.length > 260 ? `${tweet.substring(0, 257)}…` : tweet;
  }

  private async sendToChannel(target: PublishingTarget, payload: Record<string, any>): Promise<{ success: boolean; response: any; error?: string }> {
    const endpoint = target.credentials?.webhookUrl || target.credentials?.webhook_url || target.credentials?.endpoint;
    if (!endpoint) {
      return {
        success: true,
        response: { skipped: true, reason: 'No endpoint configured for target' },
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(target.credentials?.authToken ? { Authorization: `Bearer ${target.credentials.authToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const text = await response.text();
      let parsed: any;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch (error) {
        parsed = { raw: text };
      }

      if (!response.ok) {
        return {
          success: false,
          response: parsed,
          error: `Remote service responded with status ${response.status}`,
        };
      }

      return {
        success: true,
        response: parsed,
      };
    } catch (error: any) {
      return {
        success: false,
        response: null,
        error: error.message || 'Failed to reach distribution endpoint',
      };
    }
  }
}
