/**
 * Server-side sanitization utilities to prevent XSS attacks
 */

// HTML entities that need to be escaped
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

/**
 * Escape HTML special characters to prevent XSS
 * @param text - Raw text to escape
 * @returns Escaped text safe for HTML context
 */
export function escapeHtml(text: string): string {
  if (!text) return '';

  return String(text).replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Remove all HTML tags and return plain text
 * @param html - HTML string
 * @returns Plain text without HTML tags
 */
export function stripHtml(html: string): string {
  if (!html) return '';

  // Remove script tags and their content
  let text = String(html).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove style tags and their content
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = decodeHtmlEntities(text);

  return text.trim();
}

/**
 * Decode HTML entities
 * @param text - Text with HTML entities
 * @returns Decoded text
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '='
  };

  return text.replace(/&[#A-Za-z0-9]+;/g, (entity) => entities[entity] || entity);
}

/**
 * Sanitize menu label - allows only safe characters
 * @param label - Menu label to sanitize
 * @returns Sanitized label
 */
export function sanitizeMenuLabel(label: string): string {
  if (!label) return '';

  // First strip any HTML
  let sanitized = stripHtml(label);

  // Remove any potentially dangerous characters but allow unicode
  // Allow: letters, numbers, spaces, common punctuation, unicode
  sanitized = sanitized.replace(/[^\w\s\-.,!?()[\]{}:;'"@#$%&*+=\/\\|~`\u0080-\uFFFF]/g, '');

  // Trim and limit length
  sanitized = sanitized.trim().substring(0, 255);

  return sanitized;
}

/**
 * Sanitize URL to prevent XSS and other attacks
 * @param url - URL to sanitize
 * @param allowedProtocols - Allowed URL protocols
 * @returns Sanitized URL or empty string if invalid
 */
export function sanitizeUrl(
  url: string,
  allowedProtocols: string[] = ['http:', 'https:', '/']
): string {
  if (!url) return '';

  const trimmed = String(url).trim();

  // Handle relative URLs
  if (trimmed.startsWith('/')) {
    // Ensure no double slashes that could be protocol-relative
    return trimmed.replace(/\/+/g, '/');
  }

  // Handle absolute URLs
  try {
    const parsed = new URL(trimmed);

    // Check protocol
    if (!allowedProtocols.includes(parsed.protocol)) {
      return '';
    }

    // Reconstruct URL to ensure it's properly formatted
    return parsed.toString();
  } catch {
    // If not a valid URL and not starting with /, reject it
    return '';
  }
}

/**
 * Validate and sanitize a batch of menu items
 * @param items - Array of menu items to sanitize
 * @returns Sanitized menu items
 */
export function sanitizeMenuItems(items: any[]): any[] {
  if (!Array.isArray(items)) return [];

  return items.map(item => ({
    ...item,
    label: sanitizeMenuLabel(item.label || ''),
    url: item.url ? sanitizeUrl(item.url) : null,
    // Recursively sanitize children if present
    children: item.children ? sanitizeMenuItems(item.children) : undefined
  }));
}

/**
 * Check if a string contains potential XSS vectors
 * @param text - Text to check
 * @returns true if potential XSS found
 */
export function containsXSS(text: string): boolean {
  if (!text) return false;

  const xssPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>/gi,
    /<applet[^>]*>.*?<\/applet>/gi,
    /data:text\/html/gi,
    /vbscript:/gi,
    /<img[^>]*onerror=/gi,
    /<svg[^>]*onload=/gi
  ];

  const testText = String(text);
  return xssPatterns.some(pattern => pattern.test(testText));
}

export default {
  escapeHtml,
  stripHtml,
  sanitizeMenuLabel,
  sanitizeUrl,
  sanitizeMenuItems,
  containsXSS
};