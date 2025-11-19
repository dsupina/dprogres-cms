"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class AiAuthorService {
    async generateExcerpt(post, request) {
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
    async generateHashtags(post, request) {
        const limit = request.limit ?? (request.channel === 'twitter' ? 4 : 6);
        const tags = this.extractKeywords(post)
            .map((keyword) => `#${keyword}`)
            .slice(0, limit);
        return Array.from(new Set(tags));
    }
    stripHtml(html) {
        return html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    truncate(text, maxLength) {
        if (text.length <= maxLength) {
            return text;
        }
        return `${text.substring(0, maxLength - 1).trim()}…`;
    }
    extractKeywords(post) {
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
    normalizeKeyword(text) {
        return text
            .replace(/[^a-zA-Z0-9]/g, '')
            .trim();
    }
}
exports.default = AiAuthorService;
//# sourceMappingURL=AiAuthorService.js.map