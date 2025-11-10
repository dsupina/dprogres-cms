interface AiContentContext {
  title: string;
  excerpt?: string | null;
  content?: string | null;
  tags?: Array<{ name: string } | string>;
}

export interface AiExcerptRequest {
  channel: string;
  maxLength?: number;
}

export interface AiHashtagRequest {
  channel: string;
  limit?: number;
}

export default class AiAuthorService {
  async generateExcerpt(post: AiContentContext, request: AiExcerptRequest): Promise<string> {
    const maxLength = request.maxLength ?? (request.channel === 'twitter' ? 180 : 260);
    if (post.excerpt && post.excerpt.trim().length > 0) {
      return this.truncate(post.excerpt, maxLength);
    }

    if (post.content) {
      const text = this.stripHtml(post.content);
      if (text) {
        return this.truncate(text, maxLength);
      }
    }

    return this.truncate(post.title, Math.min(maxLength, 120));
  }

  async generateHashtags(post: AiContentContext, request: AiHashtagRequest): Promise<string[]> {
    const limit = request.limit ?? (request.channel === 'twitter' ? 4 : 6);
    const tags = this.extractKeywords(post)
      .map((keyword) => `#${keyword}`)
      .slice(0, limit);
    return Array.from(new Set(tags));
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.substring(0, maxLength - 1).trim()}…`;
  }

  private extractKeywords(post: AiContentContext): string[] {
    if (post.tags && post.tags.length) {
      return post.tags
        .map((tag) => (typeof tag === 'string' ? tag : tag.name))
        .filter(Boolean)
        .map((tag) => this.normalizeKeyword(tag));
    }

    const basis = `${post.title} ${post.excerpt ?? ''}`.trim();
    if (!basis) {
      return [];
    }

    return basis
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .map((word) => this.normalizeKeyword(word))
      .filter((word) => word.length > 2)
      .slice(0, 8);
  }

  private normalizeKeyword(text: string): string {
    return text
      .replace(/[^a-zA-Z0-9]/g, '')
      .trim();
  }
}
