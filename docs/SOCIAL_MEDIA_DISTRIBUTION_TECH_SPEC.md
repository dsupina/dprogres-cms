# Social Media Distribution Feature - Technical Architecture Specification

**Document Version**: 1.0
**Date**: 2025-11-21
**Status**: Architecture Review
**Target Implementation**: Phase 2 (Post-EPIC-001)

---

## Executive Summary

This document provides a comprehensive technical architecture for transforming the current webhook-based distribution system into a production-ready social media distribution platform supporting Twitter/X, LinkedIn, Facebook, Instagram, TikTok, and Threads.

**Current State**: Basic webhook dispatcher with simple text truncation
**Target State**: OAuth-based multi-platform publisher with AI content adaptation, queue system, and comprehensive analytics

**Key Technical Decisions**:
- **Queue System**: BullMQ with Redis (RECOMMENDED)
- **OAuth Management**: Platform-specific credential storage with encryption at rest
- **AI Content Adaptation**: Multi-LLM router (Phase 2 priority)
- **Performance**: Background job processing to meet p95 ≤ 300ms API targets
- **Multi-tenant**: Site-scoped distribution with rate limiting per tenant

---

## 1. Architecture Overview

### 1.1 High-Level System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                        CMS Frontend (React)                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ Content Editor   │  │ Distribution UI  │  │ Analytics    │ │
│  │ (Publish Button) │  │ (Target Config)  │  │ Dashboard    │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Express Backend API                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Distribution API Routes (/api/admin/distribution/*)     │  │
│  │  - Platform OAuth callbacks                               │  │
│  │  - Target CRUD operations                                 │  │
│  │  - Dispatch endpoints                                     │  │
│  │  - Analytics queries                                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────┴────────────────────────────────┐ │
│  │              Service Layer (Business Logic)               │ │
│  │  ┌────────────────────┐  ┌────────────────────────────┐  │ │
│  │  │ DistributionService│  │   PlatformAdapterFactory   │  │ │
│  │  │ - Job enqueueing   │  │ - Twitter/X Adapter        │  │ │
│  │  │ - Status tracking  │  │ - LinkedIn Adapter         │  │ │
│  │  │ - Retry logic      │  │ - Facebook Adapter         │  │ │
│  │  └────────────────────┘  │ - Instagram Adapter        │  │ │
│  │                           │ - TikTok Adapter           │  │ │
│  │  ┌────────────────────┐  │ - Threads Adapter          │  │ │
│  │  │  AiAuthorService   │  └────────────────────────────┘  │ │
│  │  │ - Multi-LLM router │                                   │ │
│  │  │ - Content adapt    │  ┌────────────────────────────┐  │ │
│  │  │ - Cost tracking    │  │    OAuthService            │  │ │
│  │  └────────────────────┘  │ - Token refresh            │  │ │
│  │                           │ - Credential encryption    │  │ │
│  └───────────────────────────└────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
┌─────────────────────────────┐  ┌─────────────────────────────┐
│    BullMQ Queue (Redis)     │  │   PostgreSQL Database       │
│  ┌────────────────────────┐ │  │  ┌────────────────────────┐ │
│  │ distribution:dispatch  │ │  │  │ publishing_targets     │ │
│  │ distribution:retry     │ │  │  │ publishing_schedules   │ │
│  │ distribution:scheduled │ │  │  │ distribution_logs      │ │
│  │ ai:content_adapt       │ │  │  │ platform_connections   │ │
│  └────────────────────────┘ │  │  │ rate_limit_tracking    │ │
│                              │  │  └────────────────────────┘ │
│  Background Workers:         │  └─────────────────────────────┘
│  - DispatchWorker            │
│  - RetryWorker               │
│  - ScheduledPublishWorker    │
│  - AiContentWorker           │
└─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│              External Platform APIs                             │
│  Twitter/X API  │  LinkedIn API  │  Facebook Graph API          │
│  Instagram API  │  TikTok API    │  Threads API                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Request Flow

**Immediate Dispatch Flow**:
```
1. User clicks "Publish to Twitter" in CMS
2. POST /api/admin/distribution/dispatch { postId, targetIds }
3. DistributionService.dispatchImmediate()
   - Validates post existence and target status
   - Enqueues job to BullMQ: distribution:dispatch
   - Returns 202 Accepted with job ID
4. DispatchWorker picks up job
   - Fetches post content and target credentials
   - Checks rate limits (site-scoped)
   - Calls AiContentWorker if needed
   - Invokes platform adapter (e.g., TwitterAdapter)
5. Platform adapter makes OAuth API call
6. Updates distribution_logs with result
7. Emits event for real-time UI updates (WebSocket future)
```

**Scheduled Publish Flow**:
```
1. User schedules post for future publish (e.g., "Publish tomorrow at 9am")
2. POST /api/admin/distribution/schedules
3. Creates publishing_schedules record with status='pending'
4. ScheduledPublishWorker runs every minute (cron)
5. Finds schedules where scheduled_for <= NOW() AND status='pending'
6. Enqueues to distribution:dispatch queue
7. Updates schedule status to 'queued'
8. DispatchWorker handles as normal
```

---

## 2. Component Specifications

### 2.1 PlatformAdapter Interface

**Design Pattern**: Strategy Pattern for platform-specific implementations

```typescript
// backend/src/services/distribution/adapters/PlatformAdapter.ts

export interface PlatformCredentials {
  platform: 'twitter' | 'linkedin' | 'facebook' | 'instagram' | 'tiktok' | 'threads';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  userId?: string;
  accountId?: string;
  metadata?: Record<string, any>;
}

export interface PublishRequest {
  content: string;
  media?: MediaAttachment[];
  metadata?: {
    hashtags?: string[];
    mentions?: string[];
    link?: string;
    scheduleFor?: Date; // Platform-native scheduling if supported
  };
}

export interface PublishResult {
  success: boolean;
  platformPostId?: string;
  platformUrl?: string;
  error?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
}

export abstract class PlatformAdapter {
  constructor(protected credentials: PlatformCredentials) {}

  abstract publish(request: PublishRequest): Promise<PublishResult>;
  abstract validateCredentials(): Promise<boolean>;
  abstract refreshToken(): Promise<PlatformCredentials>;
  abstract getRateLimitStatus(): Promise<RateLimitStatus>;
  abstract getCharacterLimit(): number;
  abstract supportsMedia(type: 'image' | 'video' | 'gif'): boolean;
  abstract getMediaRequirements(): MediaRequirements;
}

export interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetAt: Date;
}

export interface MediaRequirements {
  maxImages: number;
  maxVideos: number;
  maxFileSize: number; // bytes
  supportedImageFormats: string[];
  supportedVideoFormats: string[];
  videoMaxDuration?: number; // seconds
}
```

### 2.2 Platform-Specific Adapters

#### 2.2.1 Twitter/X Adapter

```typescript
// backend/src/services/distribution/adapters/TwitterAdapter.ts

import { Client } from 'twitter-api-sdk';

export class TwitterAdapter extends PlatformAdapter {
  private client: Client;

  constructor(credentials: PlatformCredentials) {
    super(credentials);
    this.client = new Client(credentials.accessToken);
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    try {
      // Twitter API v2 character limit
      const tweetText = this.truncateContent(request.content, 280);

      // Upload media first if present
      const mediaIds: string[] = [];
      if (request.media && request.media.length > 0) {
        for (const media of request.media) {
          const mediaId = await this.uploadMedia(media);
          mediaIds.push(mediaId);
        }
      }

      // Create tweet
      const response = await this.client.tweets.createTweet({
        text: tweetText,
        media: mediaIds.length > 0 ? { media_ids: mediaIds } : undefined,
      });

      return {
        success: true,
        platformPostId: response.data.id,
        platformUrl: `https://twitter.com/i/web/status/${response.data.id}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: this.parseTwitterError(error),
      };
    }
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.client.users.findMyUser();
      return true;
    } catch {
      return false;
    }
  }

  async refreshToken(): Promise<PlatformCredentials> {
    // Twitter OAuth 2.0 PKCE flow token refresh
    // Implementation depends on OAuth library
    throw new Error('Twitter token refresh not implemented');
  }

  async getRateLimitStatus(): Promise<RateLimitStatus> {
    // Parse from X-Rate-Limit headers
    // Store in Redis for rate limit enforcement
    return {
      remaining: 100,
      limit: 200,
      resetAt: new Date(Date.now() + 15 * 60 * 1000),
    };
  }

  getCharacterLimit(): number {
    return 280;
  }

  supportsMedia(type: 'image' | 'video' | 'gif'): boolean {
    return true; // Twitter supports all three
  }

  getMediaRequirements(): MediaRequirements {
    return {
      maxImages: 4,
      maxVideos: 1,
      maxFileSize: 5 * 1024 * 1024, // 5MB for images, 512MB for videos
      supportedImageFormats: ['jpg', 'png', 'gif', 'webp'],
      supportedVideoFormats: ['mp4', 'mov'],
      videoMaxDuration: 140, // 2 minutes 20 seconds
    };
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength - 1) + '…';
  }

  private async uploadMedia(media: MediaAttachment): Promise<string> {
    // Upload media to Twitter
    // Returns media_id for tweet attachment
    throw new Error('Media upload not implemented');
  }

  private parseTwitterError(error: any): string {
    // Parse Twitter API error responses
    return error.message || 'Unknown Twitter error';
  }
}
```

**API Considerations**:
- **OAuth**: OAuth 2.0 PKCE (recommended) or OAuth 1.0a
- **Rate Limits**:
  - Tweet creation: 200 tweets per 15 min window (user context)
  - 300 tweets per 3 hours (per app)
- **Media Upload**: Separate endpoint, chunked upload for large videos
- **API Version**: Twitter API v2 (v1.1 deprecated)

#### 2.2.2 LinkedIn Adapter

```typescript
// backend/src/services/distribution/adapters/LinkedInAdapter.ts

export class LinkedInAdapter extends PlatformAdapter {
  private baseUrl = 'https://api.linkedin.com/v2';

  async publish(request: PublishRequest): Promise<PublishResult> {
    try {
      // LinkedIn uses UGC (User Generated Content) posts
      const payload = {
        author: `urn:li:person:${this.credentials.userId}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: request.content,
            },
            shareMediaCategory: request.media?.length > 0 ? 'IMAGE' : 'NONE',
            media: await this.prepareMedia(request.media),
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      const response = await fetch(`${this.baseUrl}/ugcPosts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.credentials.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`LinkedIn API error: ${response.status}`);
      }

      const data = await response.json();
      const postId = data.id.split(':').pop();

      return {
        success: true,
        platformPostId: postId,
        platformUrl: `https://www.linkedin.com/feed/update/${data.id}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getCharacterLimit(): number {
    return 3000; // LinkedIn posts support up to 3000 characters
  }

  supportsMedia(type: 'image' | 'video' | 'gif'): boolean {
    return type === 'image' || type === 'video';
  }

  getMediaRequirements(): MediaRequirements {
    return {
      maxImages: 9,
      maxVideos: 1,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      supportedImageFormats: ['jpg', 'png'],
      supportedVideoFormats: ['mp4'],
      videoMaxDuration: 600, // 10 minutes
    };
  }

  // ... validateCredentials, refreshToken, getRateLimitStatus implementations
}
```

**API Considerations**:
- **OAuth**: OAuth 2.0 Authorization Code flow
- **Rate Limits**: 100 API calls per user per day (varies by permission)
- **Media Upload**: Two-step process (register upload, upload asset)
- **Permissions Required**: `w_member_social` scope

#### 2.2.3 Facebook Adapter

```typescript
// backend/src/services/distribution/adapters/FacebookAdapter.ts

export class FacebookAdapter extends PlatformAdapter {
  private graphApiVersion = 'v18.0';
  private baseUrl = `https://graph.facebook.com/${this.graphApiVersion}`;

  async publish(request: PublishRequest): Promise<PublishResult> {
    try {
      // Determine if posting to Page or User profile
      const targetId = this.credentials.accountId || 'me';
      const endpoint = `${this.baseUrl}/${targetId}/feed`;

      const formData = new FormData();
      formData.append('message', request.content);
      formData.append('access_token', this.credentials.accessToken);

      if (request.metadata?.link) {
        formData.append('link', request.metadata.link);
      }

      // For media, use photos endpoint instead
      const actualEndpoint = request.media?.length > 0
        ? `${this.baseUrl}/${targetId}/photos`
        : endpoint;

      if (request.media?.length > 0) {
        // Single photo upload (multi-photo requires batch API)
        formData.append('url', request.media[0].url);
      }

      const response = await fetch(actualEndpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Facebook API error');
      }

      return {
        success: true,
        platformPostId: data.id,
        platformUrl: `https://www.facebook.com/${data.id}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getCharacterLimit(): number {
    return 63206; // Facebook supports very long posts
  }

  supportsMedia(type: 'image' | 'video' | 'gif'): boolean {
    return true;
  }

  getMediaRequirements(): MediaRequirements {
    return {
      maxImages: 10, // In album
      maxVideos: 1,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      supportedImageFormats: ['jpg', 'png', 'gif'],
      supportedVideoFormats: ['mp4', 'mov'],
      videoMaxDuration: 1200, // 20 minutes
    };
  }

  // ... validateCredentials, refreshToken, getRateLimitStatus implementations
}
```

**API Considerations**:
- **OAuth**: OAuth 2.0
- **Permissions**: `pages_manage_posts` (for pages), `publish_to_groups` (for groups)
- **Rate Limits**: 200 calls per hour per user
- **Media**: Graph API supports photos, videos, albums
- **Posting Context**: Can post to User profile, Page, or Group (different permissions)

#### 2.2.4 Instagram Adapter (Business Accounts)

```typescript
// backend/src/services/distribution/adapters/InstagramAdapter.ts

export class InstagramAdapter extends PlatformAdapter {
  // Instagram Graph API requires Facebook Page connection
  private graphApiVersion = 'v18.0';
  private baseUrl = `https://graph.facebook.com/${this.graphApiVersion}`;

  async publish(request: PublishRequest): Promise<PublishResult> {
    try {
      // Instagram requires Business or Creator account connected to Facebook Page
      const igUserId = this.credentials.userId;

      // Step 1: Create media container
      const containerPayload = {
        image_url: request.media?.[0]?.url, // Instagram requires media
        caption: request.content,
        access_token: this.credentials.accessToken,
      };

      const containerResponse = await fetch(
        `${this.baseUrl}/${igUserId}/media`,
        {
          method: 'POST',
          body: new URLSearchParams(containerPayload),
        }
      );

      const containerData = await containerResponse.json();
      const containerId = containerData.id;

      // Step 2: Publish the container
      const publishResponse = await fetch(
        `${this.baseUrl}/${igUserId}/media_publish`,
        {
          method: 'POST',
          body: new URLSearchParams({
            creation_id: containerId,
            access_token: this.credentials.accessToken,
          }),
        }
      );

      const publishData = await publishResponse.json();

      return {
        success: true,
        platformPostId: publishData.id,
        platformUrl: `https://www.instagram.com/p/${publishData.id}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getCharacterLimit(): number {
    return 2200; // Instagram caption limit
  }

  supportsMedia(type: 'image' | 'video' | 'gif'): boolean {
    return type === 'image' || type === 'video'; // No GIF support
  }

  getMediaRequirements(): MediaRequirements {
    return {
      maxImages: 10, // Carousel posts
      maxVideos: 1,
      maxFileSize: 8 * 1024 * 1024, // 8MB
      supportedImageFormats: ['jpg', 'png'],
      supportedVideoFormats: ['mp4'],
      videoMaxDuration: 60, // 60 seconds for feed, 15 for stories
    };
  }

  // ... other implementations
}
```

**API Considerations**:
- **Requirements**: Instagram Business or Creator account + Facebook Page connection
- **OAuth**: OAuth 2.0 via Facebook Login
- **Permissions**: `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`
- **Rate Limits**: 200 calls per hour per user
- **Media Requirement**: Instagram posts MUST have media (images or video)
- **Two-Step Process**: Create container → Publish container

#### 2.2.5 TikTok Adapter

```typescript
// backend/src/services/distribution/adapters/TikTokAdapter.ts

export class TikTokAdapter extends PlatformAdapter {
  // TikTok Content Posting API (Limited availability)
  private baseUrl = 'https://open-api.tiktok.com';

  async publish(request: PublishRequest): Promise<PublishResult> {
    // NOTE: TikTok API has limited availability and requires approval
    // Only supports video uploads via direct upload or share URLs

    try {
      // TikTok requires video upload
      if (!request.media || request.media.length === 0) {
        throw new Error('TikTok requires video content');
      }

      // Step 1: Initialize video upload
      const initResponse = await fetch(
        `${this.baseUrl}/share/video/upload/`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.credentials.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            video_url: request.media[0].url,
            description: request.content,
            disable_comment: false,
            disable_duet: false,
            disable_stitch: false,
          }),
        }
      );

      const data = await initResponse.json();

      return {
        success: data.data?.publish_id ? true : false,
        platformPostId: data.data?.publish_id,
        error: data.error?.message,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getCharacterLimit(): number {
    return 2200; // TikTok description limit
  }

  supportsMedia(type: 'image' | 'video' | 'gif'): boolean {
    return type === 'video'; // TikTok is video-only
  }

  getMediaRequirements(): MediaRequirements {
    return {
      maxImages: 0,
      maxVideos: 1,
      maxFileSize: 4 * 1024 * 1024 * 1024, // 4GB
      supportedImageFormats: [],
      supportedVideoFormats: ['mp4', 'webm'],
      videoMaxDuration: 600, // 10 minutes
    };
  }

  // ... other implementations
}
```

**API Considerations**:
- **Availability**: TikTok Content Posting API requires approval and is limited
- **OAuth**: OAuth 2.0 Authorization Code flow
- **Permissions**: `video.upload`, `video.publish`
- **Rate Limits**: Strict limits (varies by approval tier)
- **Video Only**: TikTok only supports video content
- **Alternative**: Consider using share URLs for easier integration

#### 2.2.6 Threads Adapter

```typescript
// backend/src/services/distribution/adapters/ThreadsAdapter.ts

export class ThreadsAdapter extends PlatformAdapter {
  // Threads API (Meta/Instagram based)
  private graphApiVersion = 'v18.0';
  private baseUrl = `https://graph.threads.net/${this.graphApiVersion}`;

  async publish(request: PublishRequest): Promise<PublishResult> {
    // NOTE: Threads API is still in beta/development
    // API structure similar to Instagram Graph API

    try {
      const threadsUserId = this.credentials.userId;

      // Create media container
      const payload = {
        media_type: request.media?.length > 0 ? 'IMAGE' : 'TEXT',
        text: request.content,
        access_token: this.credentials.accessToken,
      };

      if (request.media?.length > 0) {
        payload['image_url'] = request.media[0].url;
      }

      const containerResponse = await fetch(
        `${this.baseUrl}/${threadsUserId}/threads`,
        {
          method: 'POST',
          body: new URLSearchParams(payload),
        }
      );

      const containerData = await containerResponse.json();

      // Publish container
      const publishResponse = await fetch(
        `${this.baseUrl}/${threadsUserId}/threads_publish`,
        {
          method: 'POST',
          body: new URLSearchParams({
            creation_id: containerData.id,
            access_token: this.credentials.accessToken,
          }),
        }
      );

      const publishData = await publishResponse.json();

      return {
        success: true,
        platformPostId: publishData.id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getCharacterLimit(): number {
    return 500; // Threads text limit
  }

  supportsMedia(type: 'image' | 'video' | 'gif'): boolean {
    return type === 'image' || type === 'video';
  }

  getMediaRequirements(): MediaRequirements {
    return {
      maxImages: 10,
      maxVideos: 1,
      maxFileSize: 5 * 1024 * 1024,
      supportedImageFormats: ['jpg', 'png'],
      supportedVideoFormats: ['mp4'],
      videoMaxDuration: 300, // 5 minutes
    };
  }

  // ... other implementations
}
```

**API Considerations**:
- **Status**: Threads API is in beta (as of 2024)
- **Based On**: Meta/Instagram Graph API architecture
- **OAuth**: OAuth 2.0 via Instagram/Facebook
- **Permissions**: `threads_basic`, `threads_content_publish`
- **Rate Limits**: Similar to Instagram (200 calls/hour)

### 2.3 OAuthService

```typescript
// backend/src/services/distribution/OAuthService.ts

import crypto from 'crypto';

export class OAuthService {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;

  constructor() {
    // Load from environment variable
    const keyHex = process.env.OAUTH_ENCRYPTION_KEY;
    if (!keyHex) {
      throw new Error('OAUTH_ENCRYPTION_KEY environment variable required');
    }
    this.key = Buffer.from(keyHex, 'hex');
  }

  /**
   * Encrypt OAuth credentials before storing in database
   */
  encryptCredentials(credentials: PlatformCredentials): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(credentials), 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Return: iv:authTag:encryptedData (all hex encoded)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypt OAuth credentials from database
   */
  decryptCredentials(encryptedData: string): PlatformCredentials {
    const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  /**
   * Refresh access token for platform
   */
  async refreshAccessToken(
    platform: string,
    connectionId: number
  ): Promise<PlatformCredentials> {
    // Fetch connection from database
    const connection = await this.getConnection(connectionId);
    const credentials = this.decryptCredentials(connection.encrypted_credentials);

    // Get platform adapter
    const adapter = PlatformAdapterFactory.create(platform, credentials);

    // Refresh token
    const newCredentials = await adapter.refreshToken();

    // Encrypt and save
    const encrypted = this.encryptCredentials(newCredentials);
    await this.updateConnection(connectionId, encrypted);

    return newCredentials;
  }

  private async getConnection(id: number): Promise<any> {
    const result = await query(
      'SELECT * FROM platform_connections WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  private async updateConnection(id: number, encryptedCredentials: string): Promise<void> {
    await query(
      'UPDATE platform_connections SET encrypted_credentials = $1, updated_at = NOW() WHERE id = $2',
      [encryptedCredentials, id]
    );
  }
}
```

### 2.4 Multi-LLM Router (AiAuthorService Enhancement)

```typescript
// backend/src/services/AiAuthorService.ts (Enhanced)

export interface LLMProvider {
  name: string;
  model: string;
  costPer1kTokens: number;
  maxTokens: number;
  latencyP50: number; // milliseconds
}

export interface LLMRoutingStrategy {
  selectProvider(
    promptTokens: number,
    priority: 'cost' | 'latency' | 'quality'
  ): LLMProvider;
}

export class AiAuthorService {
  private providers: Map<string, LLMProvider> = new Map();
  private fallbackChain: string[] = [];

  constructor() {
    // Register LLM providers
    this.providers.set('gemini-flash', {
      name: 'Google Gemini Flash',
      model: 'gemini-1.5-flash',
      costPer1kTokens: 0.0001,
      maxTokens: 1_000_000,
      latencyP50: 800,
    });

    this.providers.set('gpt-4o-mini', {
      name: 'OpenAI GPT-4o Mini',
      model: 'gpt-4o-mini',
      costPer1kTokens: 0.0015,
      maxTokens: 128_000,
      latencyP50: 1200,
    });

    this.providers.set('cohere-command', {
      name: 'Cohere Command',
      model: 'command-light',
      costPer1kTokens: 0.0005,
      maxTokens: 4096,
      latencyP50: 600,
    });

    this.providers.set('claude-haiku', {
      name: 'Anthropic Claude Haiku',
      model: 'claude-3-haiku-20240307',
      costPer1kTokens: 0.00025,
      maxTokens: 200_000,
      latencyP50: 900,
    });

    // Fallback chain: fast/cheap → quality
    this.fallbackChain = ['gemini-flash', 'gpt-4o-mini', 'cohere-command', 'claude-haiku'];
  }

  /**
   * Generate platform-optimized content
   */
  async adaptContentForPlatform(
    post: PostContent,
    platform: string,
    options: { maxLength?: number } = {}
  ): Promise<string> {
    const prompt = this.buildAdaptationPrompt(post, platform, options);

    try {
      const response = await this.callLLM('gemini-flash', prompt);
      return response.text;
    } catch (error) {
      // Fallback to next provider
      return this.callWithFallback(prompt);
    }
  }

  /**
   * Generate hashtags for platform
   */
  async generateHashtags(
    post: PostContent,
    platform: string,
    limit: number = 5
  ): Promise<string[]> {
    const prompt = `Generate ${limit} relevant hashtags for this ${platform} post:

Title: ${post.title}
Content: ${post.excerpt || post.content?.substring(0, 500)}

Return ONLY the hashtags, one per line, without # prefix.`;

    try {
      const response = await this.callLLM('gemini-flash', prompt);
      return response.text
        .split('\n')
        .map(tag => tag.trim())
        .filter(Boolean)
        .slice(0, limit);
    } catch (error) {
      // Fallback to keyword extraction
      return this.extractKeywords(post).slice(0, limit);
    }
  }

  /**
   * Generate image caption/alt text
   */
  async generateImageCaption(imageUrl: string, context?: string): Promise<string> {
    // Requires vision model (GPT-4V, Gemini Pro Vision, etc.)
    const prompt = `Analyze this image and generate a concise, engaging caption for social media.
    ${context ? `Context: ${context}` : ''}

Image URL: ${imageUrl}

Return only the caption text.`;

    return this.callLLM('gemini-flash', prompt).then(r => r.text);
  }

  private async callLLM(providerName: string, prompt: string): Promise<{ text: string; tokens: number }> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    // Track cost
    const startTime = Date.now();

    // Call actual LLM API (pseudo-code)
    const response = await this.callProviderAPI(provider, prompt);

    const latency = Date.now() - startTime;
    const cost = (response.tokens / 1000) * provider.costPer1kTokens;

    // Log metrics
    await this.logLLMUsage({
      provider: providerName,
      model: provider.model,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      totalTokens: response.tokens,
      cost,
      latency,
      timestamp: new Date(),
    });

    return response;
  }

  private async callWithFallback(prompt: string): Promise<string> {
    let lastError: Error | null = null;

    for (const providerName of this.fallbackChain) {
      try {
        const response = await this.callLLM(providerName, prompt);
        return response.text;
      } catch (error) {
        lastError = error as Error;
        continue;
      }
    }

    throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
  }

  private buildAdaptationPrompt(
    post: PostContent,
    platform: string,
    options: { maxLength?: number }
  ): string {
    const maxLength = options.maxLength || this.getDefaultMaxLength(platform);

    return `Adapt this blog post content for ${platform}. Keep it engaging and platform-appropriate.

Title: ${post.title}
Excerpt: ${post.excerpt}
Link: ${post.url}

Requirements:
- Maximum ${maxLength} characters
- Include relevant hashtags
- Maintain key message
- Use ${platform} best practices

Return ONLY the adapted post text, ready to publish.`;
  }

  private getDefaultMaxLength(platform: string): number {
    const limits: Record<string, number> = {
      twitter: 280,
      linkedin: 3000,
      facebook: 500,
      instagram: 2200,
      tiktok: 2200,
      threads: 500,
    };
    return limits[platform] || 280;
  }

  private async callProviderAPI(provider: LLMProvider, prompt: string): Promise<any> {
    // Actual implementation depends on provider
    // Pseudo-code:
    switch (provider.name) {
      case 'Google Gemini Flash':
        return this.callGemini(provider.model, prompt);
      case 'OpenAI GPT-4o Mini':
        return this.callOpenAI(provider.model, prompt);
      case 'Cohere Command':
        return this.callCohere(provider.model, prompt);
      case 'Anthropic Claude Haiku':
        return this.callClaude(provider.model, prompt);
      default:
        throw new Error(`Provider ${provider.name} not implemented`);
    }
  }

  private async logLLMUsage(usage: any): Promise<void> {
    // Log to database for cost tracking and analytics
    await query(
      `INSERT INTO ai_usage_logs (provider, model, prompt_tokens, completion_tokens, total_tokens, cost, latency, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        usage.provider,
        usage.model,
        usage.promptTokens,
        usage.completionTokens,
        usage.totalTokens,
        usage.cost,
        usage.latency,
      ]
    );
  }

  // ... existing methods (generateExcerpt, extractKeywords, etc.)
}
```

---

## 3. Database Schema Enhancements

### 3.1 New Tables

```sql
-- Platform OAuth connections (separate from publishing_targets)
CREATE TABLE IF NOT EXISTS platform_connections (
    id SERIAL PRIMARY KEY,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(30) NOT NULL CHECK (platform IN ('twitter', 'linkedin', 'facebook', 'instagram', 'tiktok', 'threads')),
    account_id VARCHAR(255), -- Platform-specific user/account ID
    account_name VARCHAR(255), -- Display name for UI
    encrypted_credentials TEXT NOT NULL, -- AES-256-GCM encrypted JSON
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_validated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ, -- Token expiration
    metadata JSONB DEFAULT '{}'::jsonb, -- Platform-specific data
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(site_id, platform, account_id)
);

CREATE INDEX idx_platform_connections_site ON platform_connections(site_id);
CREATE INDEX idx_platform_connections_user ON platform_connections(user_id);
CREATE INDEX idx_platform_connections_active ON platform_connections(site_id, is_active) WHERE is_active = TRUE;

-- Rate limit tracking per site per platform
CREATE TABLE IF NOT EXISTS rate_limit_tracking (
    id SERIAL PRIMARY KEY,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    platform VARCHAR(30) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0,
    limit_max INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(site_id, platform, window_start)
);

CREATE INDEX idx_rate_limit_tracking_lookup ON rate_limit_tracking(site_id, platform, window_start);

-- AI usage tracking for cost analysis
CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id BIGSERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    operation VARCHAR(50) NOT NULL, -- 'content_adapt', 'hashtag_gen', 'image_caption'
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    cost_usd DECIMAL(10, 6) NOT NULL,
    latency_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Create monthly partitions (example for 2025)
CREATE TABLE ai_usage_logs_2025_01 PARTITION OF ai_usage_logs
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE INDEX idx_ai_usage_logs_site_time ON ai_usage_logs(site_id, created_at DESC);
CREATE INDEX idx_ai_usage_logs_cost ON ai_usage_logs(created_at DESC, cost_usd);

-- Distribution analytics (aggregated metrics)
CREATE TABLE IF NOT EXISTS distribution_analytics (
    id SERIAL PRIMARY KEY,
    site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    platform VARCHAR(30) NOT NULL,
    date DATE NOT NULL,
    posts_sent INTEGER NOT NULL DEFAULT 0,
    posts_failed INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    avg_latency_ms INTEGER,
    ai_cost_usd DECIMAL(10, 4) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(site_id, platform, date)
);

CREATE INDEX idx_distribution_analytics_lookup ON distribution_analytics(site_id, date DESC);
```

### 3.2 Schema Modifications

```sql
-- Add site_id to existing tables for multi-tenant support
ALTER TABLE publishing_targets
    ADD COLUMN IF NOT EXISTS site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE;

ALTER TABLE publishing_schedules
    ADD COLUMN IF NOT EXISTS connection_id INTEGER REFERENCES platform_connections(id) ON DELETE SET NULL;

ALTER TABLE distribution_logs
    ADD COLUMN IF NOT EXISTS site_id INTEGER REFERENCES sites(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ai_adapted BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ai_cost_usd DECIMAL(10, 6),
    ADD COLUMN IF NOT EXISTS platform_post_id VARCHAR(255), -- ID from platform
    ADD COLUMN IF NOT EXISTS platform_url TEXT; -- Direct link to post

-- Add indexes for multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_publishing_targets_site ON publishing_targets(site_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_publishing_schedules_connection ON publishing_schedules(connection_id);
CREATE INDEX IF NOT EXISTS idx_distribution_logs_site ON distribution_logs(site_id, created_at DESC);

-- Migrate existing data (assign to default site)
UPDATE publishing_targets
SET site_id = (SELECT id FROM sites WHERE is_default = TRUE LIMIT 1)
WHERE site_id IS NULL;

-- Add NOT NULL constraint after migration
ALTER TABLE publishing_targets
    ALTER COLUMN site_id SET NOT NULL;
```

### 3.3 Updated publishing_targets Structure

The `publishing_targets` table now serves as a template/configuration rather than storing credentials:

```sql
-- Publishing targets now reference platform_connections for credentials
ALTER TABLE publishing_targets
    ADD COLUMN IF NOT EXISTS connection_id INTEGER REFERENCES platform_connections(id) ON DELETE SET NULL;

-- A target can override connection settings or use connection defaults
-- Example: Use same Twitter connection but with different default hashtags
```

---

## 4. API Endpoint Specifications

### 4.1 Platform Connection Management

#### 4.1.1 Initiate OAuth Flow

```
POST /api/admin/distribution/platforms/:platform/connect

Request Body:
{
  "siteId": 123,
  "redirectUrl": "https://cms.example.com/admin/distribution/connections"
}

Response: 200 OK
{
  "success": true,
  "data": {
    "authUrl": "https://twitter.com/i/oauth2/authorize?...",
    "state": "abc123...", // CSRF token
    "expiresAt": "2025-11-21T12:00:00Z"
  }
}
```

**Implementation**:
```typescript
router.post('/platforms/:platform/connect', auth, async (req, res) => {
  const { platform } = req.params;
  const { siteId, redirectUrl } = req.body;
  const userId = req.user.id;

  // Validate platform support
  const supportedPlatforms = ['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok', 'threads'];
  if (!supportedPlatforms.includes(platform)) {
    return res.status(400).json({ error: 'Unsupported platform' });
  }

  // Validate site access
  const hasAccess = await siteService.validateUserAccess(userId, siteId);
  if (!hasAccess) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Generate OAuth URL
  const oauthService = new OAuthService();
  const authData = await oauthService.initiateOAuth(platform, siteId, userId, redirectUrl);

  res.json({ success: true, data: authData });
});
```

#### 4.1.2 OAuth Callback

```
GET /api/admin/distribution/platforms/:platform/callback?code=...&state=...

Response: 302 Redirect
Location: https://cms.example.com/admin/distribution/connections?success=true
```

**Implementation**:
```typescript
router.get('/platforms/:platform/callback', async (req, res) => {
  const { platform } = req.params;
  const { code, state } = req.query;

  try {
    // Validate state (CSRF protection)
    const oauthService = new OAuthService();
    const stateData = await oauthService.validateState(state as string);

    // Exchange code for access token
    const credentials = await oauthService.exchangeCode(platform, code as string);

    // Encrypt and store credentials
    const connectionId = await oauthService.saveConnection({
      siteId: stateData.siteId,
      userId: stateData.userId,
      platform,
      credentials,
    });

    // Redirect to success page
    res.redirect(`${stateData.redirectUrl}?success=true&connectionId=${connectionId}`);
  } catch (error) {
    res.redirect(`${stateData.redirectUrl}?error=oauth_failed`);
  }
});
```

#### 4.1.3 List Connections

```
GET /api/admin/distribution/connections?siteId=123

Response: 200 OK
{
  "success": true,
  "data": [
    {
      "id": 1,
      "platform": "twitter",
      "accountName": "@example",
      "accountId": "123456789",
      "isActive": true,
      "lastValidatedAt": "2025-11-21T10:00:00Z",
      "expiresAt": "2025-12-21T10:00:00Z",
      "createdAt": "2025-10-01T10:00:00Z"
    }
  ]
}
```

#### 4.1.4 Delete Connection

```
DELETE /api/admin/distribution/connections/:id

Response: 200 OK
{
  "success": true,
  "message": "Connection deleted successfully"
}
```

### 4.2 Publishing Target CRUD

#### 4.2.1 Create Publishing Target

```
POST /api/admin/distribution/targets

Request Body:
{
  "siteId": 123,
  "connectionId": 5, // Reference to platform_connections
  "name": "Main Twitter Account",
  "defaultPayload": {
    "hashtags": ["startup", "tech"],
    "includeLink": true
  },
  "isActive": true,
  "rateLimitPerHour": 50
}

Response: 201 Created
{
  "success": true,
  "data": {
    "id": 10,
    "siteId": 123,
    "connectionId": 5,
    "name": "Main Twitter Account",
    "platform": "twitter", // Derived from connection
    "channel": "twitter", // Legacy field
    "defaultPayload": { ... },
    "isActive": true,
    "rateLimitPerHour": 50,
    "createdAt": "2025-11-21T10:00:00Z"
  }
}
```

### 4.3 Distribution Dispatch

#### 4.3.1 Immediate Dispatch

```
POST /api/admin/distribution/dispatch

Request Body:
{
  "postId": 456,
  "targetIds": [1, 2, 3],
  "requestAiAssets": true,
  "customMessage": "Check out our latest post!"
}

Response: 202 Accepted
{
  "success": true,
  "data": {
    "jobIds": ["job-abc123", "job-def456", "job-ghi789"],
    "message": "Distribution jobs enqueued successfully"
  }
}
```

**Implementation with BullMQ**:
```typescript
router.post('/dispatch', auth, async (req, res) => {
  const { postId, targetIds, requestAiAssets, customMessage } = req.body;
  const userId = req.user.id;

  // Validate post access
  const post = await postService.getById(postId);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  // Validate targets
  const targets = await distributionDb.getTargetsByIds(targetIds);
  if (targets.length !== targetIds.length) {
    return res.status(400).json({ error: 'Invalid target IDs' });
  }

  // Enqueue distribution jobs
  const jobIds: string[] = [];
  for (const target of targets) {
    const job = await distributionQueue.add('dispatch', {
      postId,
      targetId: target.id,
      connectionId: target.connection_id,
      userId,
      requestAiAssets,
      customMessage,
    }, {
      priority: 1, // Higher priority
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1 minute
      },
    });
    jobIds.push(job.id);
  }

  res.status(202).json({
    success: true,
    data: { jobIds, message: 'Distribution jobs enqueued successfully' },
  });
});
```

#### 4.3.2 Schedule Dispatch

```
POST /api/admin/distribution/schedules

Request Body:
{
  "postId": 456,
  "targetId": 1,
  "scheduledFor": "2025-11-22T09:00:00Z",
  "options": {
    "requestAiAssets": true,
    "customMessage": "Good morning!"
  }
}

Response: 201 Created
{
  "success": true,
  "data": {
    "id": 100,
    "postId": 456,
    "targetId": 1,
    "scheduledFor": "2025-11-22T09:00:00Z",
    "status": "pending",
    "createdAt": "2025-11-21T10:00:00Z"
  }
}
```

### 4.4 Analytics and Reporting

#### 4.4.1 Get Distribution Metrics

```
GET /api/admin/distribution/analytics?siteId=123&startDate=2025-11-01&endDate=2025-11-21

Response: 200 OK
{
  "success": true,
  "data": {
    "summary": {
      "totalSent": 1250,
      "totalFailed": 45,
      "successRate": 0.965,
      "avgLatency": 1850,
      "totalAiCost": 12.45
    },
    "byPlatform": {
      "twitter": {
        "sent": 500,
        "failed": 10,
        "successRate": 0.98,
        "avgLatency": 1200
      },
      "linkedin": {
        "sent": 350,
        "failed": 15,
        "successRate": 0.959,
        "avgLatency": 2200
      }
    },
    "timeline": [
      {
        "date": "2025-11-01",
        "sent": 60,
        "failed": 2
      }
    ]
  }
}
```

#### 4.4.2 Get Queue Status

```
GET /api/admin/distribution/queue/status

Response: 200 OK
{
  "success": true,
  "data": {
    "waiting": 5,
    "active": 3,
    "completed": 1247,
    "failed": 12,
    "delayed": 0,
    "workers": 4
  }
}
```

---

## 5. Queue System Design (BullMQ + Redis)

### 5.1 Why BullMQ?

**Advantages**:
- ✅ Built on Redis (already planned infrastructure)
- ✅ Excellent TypeScript support
- ✅ Advanced features: rate limiting, priority, delayed jobs
- ✅ Built-in retry with exponential backoff
- ✅ Job progress tracking and events
- ✅ Dead letter queue for failed jobs
- ✅ Horizontal scaling (multiple workers)

**Alternative Considered**: Bull (predecessor)
- ❌ Less active maintenance
- ❌ Fewer features

### 5.2 Queue Architecture

```typescript
// backend/src/queues/distributionQueue.ts

import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';

// Redis connection
const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});

// Distribution queue
export const distributionQueue = new Queue('distribution', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000, // Start with 1 minute
    },
    removeOnComplete: {
      count: 1000, // Keep last 1000 completed jobs
      age: 7 * 24 * 3600, // 7 days
    },
    removeOnFail: {
      count: 5000, // Keep last 5000 failed jobs
      age: 30 * 24 * 3600, // 30 days
    },
  },
});

// Job types
export interface DispatchJobData {
  postId: number;
  targetId: number;
  connectionId: number;
  userId: number;
  requestAiAssets?: boolean;
  customMessage?: string;
  siteId: number;
}

export interface RetryJobData {
  logId: number;
  retryCount: number;
}

export interface ScheduledPublishJobData {
  scheduleId: number;
}

export interface AiContentJobData {
  postId: number;
  platform: string;
  operation: 'adapt' | 'hashtags' | 'caption';
  maxLength?: number;
}
```

### 5.3 Worker Implementation

```typescript
// backend/src/workers/distributionWorker.ts

import { Worker, Job } from 'bullmq';
import { DispatchJobData } from '../queues/distributionQueue';
import { DistributionService } from '../services/DistributionService';
import { PlatformAdapterFactory } from '../services/distribution/PlatformAdapterFactory';
import { AiAuthorService } from '../services/AiAuthorService';

const distributionService = new DistributionService();
const aiService = new AiAuthorService();

// Main dispatch worker
export const dispatchWorker = new Worker<DispatchJobData>(
  'distribution',
  async (job: Job<DispatchJobData>) => {
    const { postId, targetId, connectionId, userId, requestAiAssets, customMessage, siteId } = job.data;

    // Update job progress
    await job.updateProgress(10);

    // 1. Fetch post content
    const post = await distributionService.getPost(postId);
    if (!post) {
      throw new Error(`Post ${postId} not found`);
    }
    await job.updateProgress(20);

    // 2. Fetch target and connection
    const target = await distributionService.getTarget(targetId);
    const connection = await distributionService.getConnection(connectionId);
    if (!target || !connection) {
      throw new Error('Target or connection not found');
    }
    await job.updateProgress(30);

    // 3. Check rate limits
    const rateLimitOk = await distributionService.checkRateLimit(siteId, connection.platform);
    if (!rateLimitOk) {
      throw new Error('Rate limit exceeded');
    }
    await job.updateProgress(40);

    // 4. AI content adaptation (if requested)
    let adaptedContent = post.title;
    let hashtags: string[] = [];
    let aiCost = 0;

    if (requestAiAssets) {
      adaptedContent = await aiService.adaptContentForPlatform(post, connection.platform);
      hashtags = await aiService.generateHashtags(post, connection.platform);
      // Track AI cost
      aiCost = 0.001; // Placeholder
    }
    await job.updateProgress(60);

    // 5. Build platform-specific payload
    const publishRequest = distributionService.buildPublishRequest({
      post,
      adaptedContent,
      hashtags,
      customMessage,
      target,
    });
    await job.updateProgress(70);

    // 6. Get platform adapter and publish
    const adapter = PlatformAdapterFactory.create(connection.platform, connection.credentials);
    const result = await adapter.publish(publishRequest);
    await job.updateProgress(90);

    // 7. Log result
    await distributionService.logDistribution({
      postId,
      targetId,
      connectionId,
      siteId,
      status: result.success ? 'sent' : 'failed',
      platformPostId: result.platformPostId,
      platformUrl: result.platformUrl,
      error: result.error,
      aiCost,
      aiAdapted: requestAiAssets,
    });

    // 8. Update rate limit tracking
    await distributionService.incrementRateLimit(siteId, connection.platform);

    await job.updateProgress(100);

    return result;
  },
  {
    connection,
    concurrency: 5, // Process 5 jobs in parallel
    limiter: {
      max: 10, // Max 10 jobs
      duration: 1000, // per second (global rate limit)
    },
  }
);

// Event handlers
dispatchWorker.on('completed', async (job) => {
  console.log(`Job ${job.id} completed successfully`);
  // Emit event for real-time UI updates
  // eventEmitter.emit('distribution:completed', { jobId: job.id, result: job.returnvalue });
});

dispatchWorker.on('failed', async (job, error) => {
  console.error(`Job ${job?.id} failed:`, error);
  // Send alert if too many failures
  if (job && job.attemptsMade >= 3) {
    // await alertService.sendAlert('Distribution failed after 3 attempts', job.data);
  }
});

dispatchWorker.on('stalled', async (jobId) => {
  console.warn(`Job ${jobId} stalled`);
});
```

### 5.4 Scheduled Publish Worker

```typescript
// backend/src/workers/scheduledPublishWorker.ts

import { Worker } from 'bullmq';
import { ScheduledPublishJobData } from '../queues/distributionQueue';
import { distributionQueue } from '../queues/distributionQueue';
import { query } from '../utils/database';

// This worker runs on a cron schedule (every minute)
export const scheduledPublishWorker = new Worker<ScheduledPublishJobData>(
  'scheduled-publish',
  async (job: Job<ScheduledPublishJobData>) => {
    const { scheduleId } = job.data;

    // Fetch schedule
    const result = await query(
      'SELECT * FROM publishing_schedules WHERE id = $1',
      [scheduleId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }

    const schedule = result.rows[0];

    // Enqueue dispatch job
    await distributionQueue.add('dispatch', {
      postId: schedule.post_id,
      targetId: schedule.target_id,
      connectionId: schedule.connection_id,
      userId: schedule.user_id,
      requestAiAssets: schedule.options?.requestAiAssets || false,
      customMessage: schedule.options?.customMessage,
      siteId: schedule.site_id,
    });

    // Update schedule status
    await query(
      'UPDATE publishing_schedules SET status = $1, dispatched_at = NOW() WHERE id = $2',
      ['queued', scheduleId]
    );

    return { success: true };
  },
  {
    connection,
    concurrency: 1,
  }
);

// Cron job to find schedules ready to publish
import cron from 'node-cron';

cron.schedule('* * * * *', async () => {
  // Run every minute
  const result = await query(`
    SELECT id
    FROM publishing_schedules
    WHERE status = 'pending'
      AND scheduled_for <= NOW()
    ORDER BY scheduled_for ASC
    LIMIT 100
  `);

  for (const row of result.rows) {
    await distributionQueue.add('scheduled-publish', {
      scheduleId: row.id,
    });
  }
});
```

### 5.5 Queue Monitoring Dashboard

```typescript
// backend/src/routes/admin/queue.ts

import { Router } from 'express';
import { distributionQueue } from '../../queues/distributionQueue';
import { auth } from '../../middleware/auth';

const router = Router();

// Get queue status
router.get('/status', auth, async (req, res) => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    distributionQueue.getWaitingCount(),
    distributionQueue.getActiveCount(),
    distributionQueue.getCompletedCount(),
    distributionQueue.getFailedCount(),
    distributionQueue.getDelayedCount(),
  ]);

  res.json({
    success: true,
    data: {
      waiting,
      active,
      completed,
      failed,
      delayed,
      workers: dispatchWorker.opts.concurrency,
    },
  });
});

// Get failed jobs
router.get('/failed', auth, async (req, res) => {
  const failed = await distributionQueue.getFailed(0, 50);

  const jobs = failed.map(job => ({
    id: job.id,
    data: job.data,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
  }));

  res.json({ success: true, data: jobs });
});

// Retry failed job
router.post('/retry/:jobId', auth, async (req, res) => {
  const { jobId } = req.params;
  const job = await distributionQueue.getJob(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  await job.retry();
  res.json({ success: true, message: 'Job retried' });
});

// Clean completed jobs
router.post('/clean', auth, async (req, res) => {
  await distributionQueue.clean(7 * 24 * 3600 * 1000, 1000, 'completed');
  await distributionQueue.clean(30 * 24 * 3600 * 1000, 5000, 'failed');

  res.json({ success: true, message: 'Queue cleaned' });
});

export default router;
```

---

## 6. Security Considerations

### 6.1 OAuth Token Security

**Encryption at Rest**:
```typescript
// Environment variable setup
OAUTH_ENCRYPTION_KEY=<64-character-hex-key> // 32 bytes for AES-256

// Generate key (one-time setup)
const key = crypto.randomBytes(32).toString('hex');
```

**Key Rotation**:
```typescript
// backend/src/services/distribution/keyRotation.ts

export async function rotateEncryptionKey(oldKey: string, newKey: string): Promise<void> {
  const oauthService = new OAuthService();

  // Fetch all connections
  const connections = await query('SELECT id, encrypted_credentials FROM platform_connections');

  for (const conn of connections.rows) {
    // Decrypt with old key
    const oldService = new OAuthService(oldKey);
    const credentials = oldService.decryptCredentials(conn.encrypted_credentials);

    // Re-encrypt with new key
    const newService = new OAuthService(newKey);
    const reEncrypted = newService.encryptCredentials(credentials);

    // Update database
    await query(
      'UPDATE platform_connections SET encrypted_credentials = $1 WHERE id = $2',
      [reEncrypted, conn.id]
    );
  }

  console.log(`Rotated encryption key for ${connections.rows.length} connections`);
}
```

### 6.2 Rate Limiting

**Per-Tenant Rate Limiting**:
```typescript
// backend/src/services/RateLimitService.ts

export class RateLimitService {
  async checkRateLimit(siteId: number, platform: string): Promise<boolean> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 3600000); // 1 hour ago

    // Get rate limit for platform
    const platformLimits = {
      twitter: 200,
      linkedin: 100,
      facebook: 200,
      instagram: 200,
      tiktok: 50,
      threads: 100,
    };
    const limit = platformLimits[platform] || 100;

    // Count recent distributions
    const result = await query(`
      SELECT COUNT(*) as count
      FROM distribution_logs
      WHERE site_id = $1
        AND platform = $2
        AND created_at >= $3
        AND status = 'sent'
    `, [siteId, platform, windowStart]);

    const count = parseInt(result.rows[0].count);
    return count < limit;
  }

  async incrementRateLimit(siteId: number, platform: string): Promise<void> {
    // Track in rate_limit_tracking table
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0);
    const windowEnd = new Date(windowStart.getTime() + 3600000);

    await query(`
      INSERT INTO rate_limit_tracking (site_id, platform, window_start, window_end, request_count, limit_max)
      VALUES ($1, $2, $3, $4, 1, $5)
      ON CONFLICT (site_id, platform, window_start)
      DO UPDATE SET
        request_count = rate_limit_tracking.request_count + 1,
        updated_at = NOW()
    `, [siteId, platform, windowStart, windowEnd, 200]);
  }
}
```

### 6.3 Audit Logging

```typescript
// backend/src/services/AuditService.ts

export class AuditService {
  async logDistributionAction(action: string, data: any): Promise<void> {
    await query(`
      INSERT INTO audit_logs (
        user_id,
        site_id,
        action,
        entity_type,
        entity_id,
        metadata,
        ip_address,
        user_agent,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `, [
      data.userId,
      data.siteId,
      action,
      'distribution',
      data.entityId,
      JSON.stringify(data.metadata),
      data.ipAddress,
      data.userAgent,
    ]);
  }
}
```

### 6.4 Input Validation

```typescript
// backend/src/routes/admin/distribution.ts

import Joi from 'joi';
import { validation } from '../../middleware/validation';

const dispatchSchema = Joi.object({
  postId: Joi.number().integer().positive().required(),
  targetIds: Joi.array().items(Joi.number().integer().positive()).min(1).max(10).required(),
  requestAiAssets: Joi.boolean().optional(),
  customMessage: Joi.string().max(1000).optional(),
});

router.post('/dispatch', auth, validation(dispatchSchema), async (req, res) => {
  // Implementation
});
```

---

## 7. Performance Optimization

### 7.1 Caching Strategy

**Redis Caching for Platform Credentials**:
```typescript
// backend/src/services/distribution/CredentialCache.ts

export class CredentialCache {
  private redis: Redis;
  private ttl = 3600; // 1 hour

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
  }

  private getCacheKey(connectionId: number): string {
    return `credentials:${connectionId}`;
  }

  async get(connectionId: number): Promise<PlatformCredentials | null> {
    const cached = await this.redis.get(this.getCacheKey(connectionId));
    if (!cached) return null;

    return JSON.parse(cached);
  }

  async set(connectionId: number, credentials: PlatformCredentials): Promise<void> {
    await this.redis.setex(
      this.getCacheKey(connectionId),
      this.ttl,
      JSON.stringify(credentials)
    );
  }

  async invalidate(connectionId: number): Promise<void> {
    await this.redis.del(this.getCacheKey(connectionId));
  }
}
```

**Database Query Optimization**:
```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_distribution_logs_site_status_time
  ON distribution_logs(site_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY idx_publishing_schedules_status_scheduled
  ON publishing_schedules(status, scheduled_for)
  WHERE status IN ('pending', 'queued');

-- Materialize distribution analytics for dashboard
CREATE MATERIALIZED VIEW distribution_stats_daily AS
SELECT
  site_id,
  platform,
  DATE(created_at) as date,
  COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  AVG(latency_ms) as avg_latency,
  SUM(ai_cost_usd) as total_ai_cost
FROM distribution_logs
GROUP BY site_id, platform, DATE(created_at);

-- Refresh daily (cron job)
REFRESH MATERIALIZED VIEW CONCURRENTLY distribution_stats_daily;
```

### 7.2 Background Job Optimization

**Job Batching**:
```typescript
// Batch multiple posts to same platform
export async function batchDispatch(
  posts: number[],
  targetId: number
): Promise<string[]> {
  const jobs: string[] = [];

  // Group posts and enqueue single job
  const job = await distributionQueue.add('batch-dispatch', {
    postIds: posts,
    targetId,
  }, {
    priority: 2, // Lower priority than single dispatch
  });

  jobs.push(job.id);
  return jobs;
}
```

**Lazy Loading of AI Models**:
```typescript
// Only load LLM client when needed
class LazyLLMClient {
  private client: any = null;

  async getClient() {
    if (!this.client) {
      this.client = await this.initializeClient();
    }
    return this.client;
  }

  private async initializeClient() {
    // Load heavy LLM client
    return new LLMClient({ apiKey: process.env.LLM_API_KEY });
  }
}
```

### 7.3 Performance Monitoring

```typescript
// backend/src/utils/performanceMonitor.ts

export class PerformanceMonitor {
  static async trackOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    const startMem = process.memoryUsage();

    try {
      const result = await operation();
      const duration = Date.now() - startTime;
      const endMem = process.memoryUsage();

      // Log metrics
      await this.logMetrics({
        operation: operationName,
        duration,
        memoryDelta: endMem.heapUsed - startMem.heapUsed,
        success: true,
      });

      // Alert if p95 threshold exceeded
      if (duration > 300) {
        console.warn(`Operation ${operationName} exceeded 300ms: ${duration}ms`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logMetrics({
        operation: operationName,
        duration,
        success: false,
        error: error.message,
      });
      throw error;
    }
  }

  private static async logMetrics(metrics: any): Promise<void> {
    // Send to monitoring service (e.g., DataDog, New Relic)
    // Or store in database for analysis
  }
}

// Usage
const result = await PerformanceMonitor.trackOperation(
  'distribution:dispatch',
  () => distributionService.dispatch(postId, targetIds)
);
```

---

## 8. Implementation Complexity Assessment

| Component | Complexity (1-10) | Estimated Effort | Key Risks |
|-----------|-------------------|------------------|-----------|
| **OAuth Implementation** | 7 | 2-3 weeks | Platform-specific quirks, token refresh edge cases |
| **Twitter/X Adapter** | 5 | 1 week | API v2 migration, rate limit handling |
| **LinkedIn Adapter** | 6 | 1 week | UGC API complexity, media upload |
| **Facebook Adapter** | 7 | 1.5 weeks | Graph API changes, page vs profile |
| **Instagram Adapter** | 8 | 2 weeks | Business account requirement, two-step publish |
| **TikTok Adapter** | 9 | 2-3 weeks | Limited API availability, approval process |
| **Threads Adapter** | 6 | 1 week | Beta API, changing spec |
| **Queue System (BullMQ)** | 4 | 1 week | Well-documented, mature library |
| **Multi-LLM Router** | 6 | 2 weeks | Provider integration, cost tracking |
| **AI Content Adaptation** | 5 | 1.5 weeks | Prompt engineering, quality testing |
| **Media Upload Handler** | 7 | 1.5 weeks | Platform-specific requirements, chunking |
| **Analytics Dashboard** | 5 | 1 week | Standard queries, materialized views |
| **Rate Limiting** | 4 | 3 days | Redis-backed, site-scoped |
| **Audit Logging** | 3 | 2 days | Standard implementation |
| **Database Migrations** | 4 | 3 days | Schema changes, data migration |

**Total Estimated Effort**: 16-22 weeks (4-5.5 months) for full implementation

---

## 9. Phased Implementation Recommendation

### Phase 1 (MVP - 6 weeks)

**Goal**: Basic multi-platform distribution with manual OAuth

**Features**:
- ✅ OAuth implementation for Twitter and LinkedIn only
- ✅ Platform adapters: Twitter, LinkedIn
- ✅ Queue system with BullMQ
- ✅ Basic distribution API endpoints
- ✅ Simple UI for connecting platforms
- ✅ Distribution logs and basic analytics
- ✅ Rate limiting (per-site)
- ⚠️ AI content adaptation: Simple text truncation (existing)
- ⚠️ Media support: Images only (videos deferred)

**Database Changes**:
- `platform_connections` table
- `rate_limit_tracking` table
- Update `publishing_targets` with `site_id` and `connection_id`

**Deliverables**:
- Twitter and LinkedIn OAuth flows
- Distribution service with queue integration
- Admin UI for platform connections
- Basic analytics dashboard

**Success Criteria**:
- Successfully publish to Twitter and LinkedIn
- API p95 ≤ 300ms (API endpoints, not external API calls)
- Queue processing ≤ 10 jobs/second
- Zero credential leaks

---

### Phase 2 (Full Platform Support - 8 weeks)

**Goal**: Support all major platforms with AI content adaptation

**Features**:
- ✅ Platform adapters: Facebook, Instagram, Threads
- ✅ Multi-LLM router with cost tracking
- ✅ AI-powered content adaptation per platform
- ✅ Hashtag and mention generation
- ✅ Media upload support (images + videos)
- ✅ Scheduled publishing with cron worker
- ✅ Advanced analytics with cost breakdown

**Database Changes**:
- `ai_usage_logs` table (partitioned)
- `distribution_analytics` table

**Deliverables**:
- Facebook, Instagram, Threads adapters
- Multi-LLM router (Gemini Flash, GPT-4o Mini, Claude Haiku)
- AI content adaptation UI
- Media upload handler with platform validation
- Cost dashboard for AI usage

**Success Criteria**:
- Support 5 platforms (Twitter, LinkedIn, Facebook, Instagram, Threads)
- AI content adaptation quality ≥ 85% approval (manual review)
- Media upload success rate ≥ 95%
- AI cost ≤ $0.01 per distribution

---

### Phase 3 (Enterprise Features - 4-6 weeks)

**Goal**: Production-ready with TikTok, advanced features, and monitoring

**Features**:
- ✅ TikTok adapter (if API available)
- ✅ Bulk distribution (batch operations)
- ✅ A/B testing for content variants
- ✅ Webhook notifications for distribution events
- ✅ Advanced rate limit management (per-platform overrides)
- ✅ Queue monitoring dashboard (BullBoard integration)
- ✅ Audit log viewer
- ✅ Token auto-refresh
- ✅ Platform health checks

**Deliverables**:
- TikTok adapter
- Bulk distribution UI
- A/B testing framework
- Webhook system
- BullBoard dashboard integration
- Comprehensive monitoring

**Success Criteria**:
- Support 6 platforms (including TikTok)
- Bulk dispatch ≥ 100 posts/minute
- Queue uptime ≥ 99.9%
- Webhook delivery ≥ 99% success

---

## 10. Risks and Mitigation Strategies

### 10.1 Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Platform API Changes** | HIGH | - Version all platform adapters<br>- Monitor platform changelog APIs<br>- Implement graceful degradation<br>- Alert on adapter failures |
| **OAuth Token Management** | MEDIUM | - Implement auto-refresh with retry<br>- Store refresh tokens securely<br>- Monitor token expiration<br>- Alert admins when manual re-auth needed |
| **Rate Limiting** | MEDIUM | - Implement per-site rate limiting<br>- Track platform limits in Redis<br>- Queue jobs with delays<br>- Prioritize manual over scheduled |
| **Queue System Downtime** | MEDIUM | - Redis clustering (HA)<br>- Dead letter queue for failures<br>- Job persistence to database<br>- Retry mechanism with backoff |
| **AI Content Quality** | MEDIUM | - Fallback to simple truncation<br>- Multi-LLM routing for redundancy<br>- User preview before publish<br>- Feedback loop for retraining |
| **Media Upload Failures** | LOW | - Chunked upload for large files<br>- Retry with exponential backoff<br>- Pre-validate media requirements<br>- Clear error messages |
| **Database Performance** | LOW | - Partition large tables (ai_usage_logs)<br>- Materialized views for analytics<br>- Indexed queries<br>- Archive old logs |
| **Security Breach** | HIGH | - Encrypt credentials at rest (AES-256)<br>- Key rotation process<br>- Audit all access<br>- Rate limit API endpoints |

### 10.2 Integration Risks

| Platform | Risk | Mitigation |
|----------|------|------------|
| **Twitter/X** | API v2 changes, Elon's whims | Monitor API changelog, have fallback to manual posting |
| **LinkedIn** | Rate limits too strict | Cache data, batch operations, prioritize high-value posts |
| **Facebook** | Page vs Profile permissions | Clear UI for account type, validate permissions upfront |
| **Instagram** | Business account requirement | Document requirement clearly, guide users through setup |
| **TikTok** | API approval delay/denial | Make TikTok optional, focus on other platforms first |
| **Threads** | Beta API instability | Mark as beta in UI, implement error handling, provide manual fallback |

### 10.3 Operational Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **High AI Costs** | MEDIUM | - Set per-site monthly budgets<br>- Use cheapest LLM by default (Gemini Flash)<br>- Cache AI-generated content<br>- Optional AI (user toggle) |
| **Queue Backlog** | MEDIUM | - Auto-scale workers based on queue depth<br>- Prioritize jobs (manual > scheduled)<br>- Alert on queue depth threshold |
| **Platform Account Bans** | HIGH | - Follow platform guidelines strictly<br>- Rate limit conservatively<br>- User education on ToS<br>- Don't spam |
| **User Misconfiguration** | LOW | - Clear onboarding flow<br>- Validation before save<br>- Preview before publish<br>- Helpful error messages |

---

## 11. Feedback to Product/UX

### 11.1 Technically Simple Features

✅ **Easy to Implement** (1-2 weeks each):
- Twitter and LinkedIn integration (OAuth 2.0 mature, well-documented)
- Queue system (BullMQ is battle-tested)
- Basic analytics (standard SQL queries)
- Rate limiting (Redis-backed)
- Scheduled publishing (cron + queue)

### 11.2 Technically Complex Features

⚠️ **Complex to Implement** (2-4 weeks each):
- Instagram integration (requires Business account, two-step API, strict media requirements)
- TikTok integration (limited API availability, requires approval, video-only)
- Multi-LLM router with cost optimization (requires integration with multiple providers)
- Media upload handling (platform-specific chunking, validation, transcoding)
- A/B testing framework (requires variant tracking, analytics integration)

### 11.3 Platform Integration Feasibility

| Platform | Feasibility | Notes |
|----------|-------------|-------|
| Twitter/X | ✅ EASY | OAuth 2.0 PKCE, REST API v2, well-documented |
| LinkedIn | ✅ EASY | OAuth 2.0, UGC API, straightforward |
| Facebook | ⚠️ MEDIUM | Graph API stable, but Page vs Profile complicates UX |
| Instagram | ⚠️ COMPLEX | Requires Business account + Facebook Page, two-step publish |
| TikTok | ❌ DIFFICULT | API approval required, limited availability, video-only |
| Threads | ⚠️ MEDIUM | Beta API (changing), similar to Instagram |

**Recommendation**: Start with Twitter and LinkedIn for MVP, add Facebook/Instagram in Phase 2, defer TikTok to Phase 3 or make optional.

### 11.4 UX Considerations from Technical Constraints

**OAuth Flow**:
- ⚠️ User must leave CMS to authorize on platform
- ⚠️ Instagram requires Facebook Page connection (multi-step)
- ⚠️ TikTok requires separate API approval (can't self-service)
- ✅ **Recommendation**: Clear onboarding guide with screenshots

**Content Preview**:
- ✅ **Must Have**: Preview adapted content before publishing
- ⚠️ Character limits vary by platform (280-3000 chars)
- ⚠️ Hashtag limits vary (Twitter: 4-5, Instagram: 20-30)
- ✅ **Recommendation**: Platform-specific preview cards

**Media Requirements**:
- ⚠️ Each platform has different image/video requirements
- ⚠️ TikTok only accepts video (no images)
- ⚠️ Instagram requires media (can't post text-only)
- ✅ **Recommendation**: Pre-validate media before upload, show clear error messages

**Rate Limiting**:
- ⚠️ Users may hit rate limits with high-volume posting
- ⚠️ Rate limits vary by platform and account type
- ✅ **Recommendation**: Show remaining quota in UI, warn before hitting limit

**AI Content Adaptation**:
- ⚠️ AI-generated content may need editing
- ⚠️ AI costs can accumulate with high usage
- ✅ **Recommendation**:
  - Make AI optional (toggle)
  - Show estimated cost before generate
  - Allow editing before publish

**Scheduled Publishing**:
- ⚠️ Not all platforms support native scheduling (we handle it)
- ⚠️ Time zone handling (user's TZ vs platform's TZ)
- ✅ **Recommendation**: Clear timezone indicator, use user's local timezone

### 11.5 Feature Prioritization Based on Technical Complexity

**High Value, Low Complexity** (Do First):
1. Twitter integration
2. LinkedIn integration
3. Queue system with retry logic
4. Basic analytics dashboard
5. Scheduled publishing

**High Value, High Complexity** (Do Next):
1. Multi-LLM AI content adaptation
2. Facebook integration
3. Instagram integration
4. Media upload with platform validation

**Medium Value, High Complexity** (Defer or Make Optional):
1. TikTok integration (API availability)
2. Threads integration (beta API)
3. A/B testing framework
4. Bulk distribution UI

**Low Value, High Complexity** (Skip for Now):
1. Real-time collaboration on posts
2. Platform-native analytics import
3. Auto-posting based on triggers

---

## 12. Environment Variables

```env
# OAuth Configuration
OAUTH_ENCRYPTION_KEY=<64-character-hex-key>

# Redis (for BullMQ and caching)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Twitter OAuth 2.0
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
TWITTER_CALLBACK_URL=https://cms.example.com/api/admin/distribution/platforms/twitter/callback

# LinkedIn OAuth 2.0
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_CALLBACK_URL=https://cms.example.com/api/admin/distribution/platforms/linkedin/callback

# Facebook OAuth 2.0
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_CALLBACK_URL=https://cms.example.com/api/admin/distribution/platforms/facebook/callback

# Instagram (via Facebook)
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_CALLBACK_URL=https://cms.example.com/api/admin/distribution/platforms/instagram/callback

# TikTok OAuth 2.0
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_CALLBACK_URL=https://cms.example.com/api/admin/distribution/platforms/tiktok/callback

# Threads (via Instagram)
THREADS_APP_ID=
THREADS_APP_SECRET=
THREADS_CALLBACK_URL=https://cms.example.com/api/admin/distribution/platforms/threads/callback

# AI LLM Configuration
GOOGLE_GEMINI_API_KEY=
OPENAI_API_KEY=
COHERE_API_KEY=
ANTHROPIC_API_KEY=

# Queue Configuration
QUEUE_WORKER_CONCURRENCY=5
QUEUE_MAX_JOBS_PER_SECOND=10

# Performance
DISTRIBUTION_API_TIMEOUT=5000 # 5 seconds
```

---

## 13. Success Metrics

### 13.1 Performance Metrics

- **API Response Time**: p95 ≤ 300ms (excluding external platform API calls)
- **Queue Processing**: ≥ 10 jobs/second
- **Distribution Success Rate**: ≥ 95%
- **OAuth Success Rate**: ≥ 98% (excluding user cancellations)
- **AI Content Generation**: p95 ≤ 2 seconds

### 13.2 Business Metrics

- **Platform Coverage**: 5+ platforms by Phase 2
- **Monthly Active Distributions**: Track per site
- **AI Cost per Distribution**: ≤ $0.01 average
- **User Adoption**: % of sites with ≥1 connected platform

### 13.3 Quality Metrics

- **AI Content Quality**: ≥ 85% approval rate (manual review)
- **Error Rate**: ≤ 2% (excluding platform API errors)
- **Retry Success Rate**: ≥ 80% (of failed jobs)
- **Uptime**: ≥ 99.9% (queue system)

---

## 14. Appendix

### 14.1 Platform API Documentation Links

- **Twitter/X API v2**: https://developer.twitter.com/en/docs/twitter-api
- **LinkedIn API**: https://docs.microsoft.com/en-us/linkedin/
- **Facebook Graph API**: https://developers.facebook.com/docs/graph-api
- **Instagram Graph API**: https://developers.facebook.com/docs/instagram-api
- **TikTok API**: https://developers.tiktok.com/
- **Threads API**: https://developers.facebook.com/docs/threads

### 14.2 OAuth Libraries

- **Passport.js**: http://www.passportjs.org/ (Node.js OAuth strategies)
- **Twitter OAuth**: `twitter-api-sdk` npm package
- **LinkedIn OAuth**: `passport-linkedin-oauth2`
- **Facebook OAuth**: `passport-facebook`

### 14.3 Queue System Documentation

- **BullMQ**: https://docs.bullmq.io/
- **Bull Board** (Monitoring UI): https://github.com/felixmosh/bull-board
- **Redis**: https://redis.io/docs/

### 14.4 AI Provider Documentation

- **Google Gemini**: https://ai.google.dev/docs
- **OpenAI GPT**: https://platform.openai.com/docs
- **Anthropic Claude**: https://docs.anthropic.com/
- **Cohere**: https://docs.cohere.com/

---

## 15. Next Steps

1. **Review and Approval**: Product, UX, and Engineering review this spec
2. **Phase 1 Kickoff**: Start with Twitter + LinkedIn MVP
3. **Infrastructure Setup**: Redis, BullMQ, environment variables
4. **Database Migration**: Create new tables, migrate existing data
5. **OAuth Implementation**: Twitter and LinkedIn flows
6. **Platform Adapters**: TwitterAdapter, LinkedInAdapter
7. **Queue System**: BullMQ integration, workers
8. **API Endpoints**: Distribution routes
9. **Frontend UI**: Platform connection flow, distribution UI
10. **Testing**: Integration tests, manual testing with real platforms
11. **Documentation**: API docs, user guides
12. **Deployment**: Staging → Production
13. **Monitoring**: Set up alerts, dashboards
14. **Phase 2 Planning**: Schedule Facebook, Instagram, AI enhancement

---

**Document Status**: Ready for Architecture Review
**Next Review Date**: 2025-11-28
**Maintained By**: Tech Architect
