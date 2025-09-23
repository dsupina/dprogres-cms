/**
 * URL Validation utilities to prevent security vulnerabilities
 */

import { URL } from 'url';

interface ValidationOptions {
  allowedProtocols?: string[];
  allowedDomains?: string[];
  blockedDomains?: string[];
  allowRelative?: boolean;
  maxLength?: number;
}

const DEFAULT_OPTIONS: ValidationOptions = {
  allowedProtocols: ['http:', 'https:'],
  allowedDomains: [],
  blockedDomains: [],
  allowRelative: true,
  maxLength: 2000
};

// Common malicious URL patterns
const MALICIOUS_PATTERNS = [
  /javascript:/i,
  /data:text\/html/i,
  /vbscript:/i,
  /file:/i,
  /about:/i,
  /chrome:/i,
  /opera:/i,
  /mozilla:/i,
  /<script/i,
  /%3Cscript/i,
  /&#x3C;script/i,
  /\\x3cscript/i
];

// Reserved/dangerous domains
const DANGEROUS_DOMAINS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // AWS metadata endpoint
  'metadata.google.internal', // GCP metadata endpoint
  'metadata.azure.com' // Azure metadata endpoint
];

/**
 * Validate a URL for safety and correctness
 * @param url - URL to validate
 * @param options - Validation options
 * @returns Validation result with sanitized URL or error
 */
export function validateUrl(
  url: string,
  options: ValidationOptions = {}
): { valid: boolean; url?: string; error?: string } {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Basic validation
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required and must be a string' };
  }

  // Check length
  if (opts.maxLength && url.length > opts.maxLength) {
    return { valid: false, error: `URL exceeds maximum length of ${opts.maxLength}` };
  }

  // Trim whitespace
  const trimmedUrl = url.trim();

  // Check for malicious patterns
  for (const pattern of MALICIOUS_PATTERNS) {
    if (pattern.test(trimmedUrl)) {
      return { valid: false, error: 'URL contains potentially malicious content' };
    }
  }

  // Handle relative URLs
  if (trimmedUrl.startsWith('/')) {
    if (!opts.allowRelative) {
      return { valid: false, error: 'Relative URLs are not allowed' };
    }

    // Validate relative URL
    // Prevent directory traversal
    if (trimmedUrl.includes('../') || trimmedUrl.includes('..\\')) {
      return { valid: false, error: 'Directory traversal attempts are not allowed' };
    }

    // Ensure single leading slash
    const cleanedUrl = '/' + trimmedUrl.substring(1).replace(/\/+/g, '/');

    return { valid: true, url: cleanedUrl };
  }

  // Handle absolute URLs
  try {
    const parsed = new URL(trimmedUrl);

    // Validate protocol
    if (opts.allowedProtocols && !opts.allowedProtocols.includes(parsed.protocol)) {
      return {
        valid: false,
        error: `Protocol ${parsed.protocol} is not allowed. Allowed: ${opts.allowedProtocols.join(', ')}`
      };
    }

    // Check for dangerous domains
    const hostname = parsed.hostname.toLowerCase();

    if (DANGEROUS_DOMAINS.includes(hostname)) {
      return { valid: false, error: 'URL points to a restricted domain' };
    }

    // Check if domain is in blocked list
    if (opts.blockedDomains && opts.blockedDomains.length > 0) {
      for (const blocked of opts.blockedDomains) {
        if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
          return { valid: false, error: `Domain ${blocked} is blocked` };
        }
      }
    }

    // Check if domain is in allowed list (if specified)
    if (opts.allowedDomains && opts.allowedDomains.length > 0) {
      let isAllowed = false;
      for (const allowed of opts.allowedDomains) {
        if (hostname === allowed || hostname.endsWith(`.${allowed}`)) {
          isAllowed = true;
          break;
        }
      }
      if (!isAllowed) {
        return {
          valid: false,
          error: `Domain ${hostname} is not in the allowed list`
        };
      }
    }

    // Check for IP addresses (often used in attacks)
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(hostname)) {
      return { valid: false, error: 'Direct IP addresses are not allowed' };
    }

    // Validate port (if specified)
    if (parsed.port) {
      const port = parseInt(parsed.port);
      if (isNaN(port) || port < 1 || port > 65535) {
        return { valid: false, error: 'Invalid port number' };
      }

      // Block common internal service ports
      const blockedPorts = [22, 23, 445, 3389, 5432, 3306, 6379, 27017, 9200];
      if (blockedPorts.includes(port)) {
        return { valid: false, error: `Port ${port} is blocked for security reasons` };
      }
    }

    // Check for credentials in URL (security risk)
    if (parsed.username || parsed.password) {
      return { valid: false, error: 'URLs with embedded credentials are not allowed' };
    }

    // Return sanitized URL
    return { valid: true, url: parsed.toString() };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validate internal page reference
 * @param pageId - Page ID to validate
 * @returns boolean indicating if valid
 */
export function validatePageReference(pageId: any): boolean {
  if (!pageId) return false;

  // Ensure it's a positive integer
  const id = parseInt(pageId);
  return !isNaN(id) && id > 0 && id === Number(pageId);
}

/**
 * Validate menu item URL (can be external URL or internal page reference)
 * @param url - URL to validate
 * @param pageId - Optional page ID for internal links
 * @param options - Validation options
 * @returns Validation result
 */
export function validateMenuItemUrl(
  url?: string | null,
  pageId?: number | null,
  options: ValidationOptions = {}
): { valid: boolean; error?: string; type?: 'external' | 'internal' | 'none' } {
  // Must have either URL or page ID, but not both
  if (url && pageId) {
    return { valid: false, error: 'Menu item cannot have both URL and page ID' };
  }

  // Can have neither (for parent menu items)
  if (!url && !pageId) {
    return { valid: true, type: 'none' };
  }

  // Validate page reference
  if (pageId) {
    if (!validatePageReference(pageId)) {
      return { valid: false, error: 'Invalid page ID' };
    }
    return { valid: true, type: 'internal' };
  }

  // Validate external URL
  if (url) {
    const result = validateUrl(url, options);
    if (!result.valid) {
      return { valid: false, error: result.error };
    }
    return { valid: true, type: 'external' };
  }

  return { valid: false, error: 'Invalid menu item URL configuration' };
}

/**
 * Batch validate multiple URLs
 * @param urls - Array of URLs to validate
 * @param options - Validation options
 * @returns Array of validation results
 */
export function validateUrls(
  urls: string[],
  options: ValidationOptions = {}
): Array<{ url: string; valid: boolean; error?: string }> {
  if (!Array.isArray(urls)) return [];

  return urls.map(url => {
    const result = validateUrl(url, options);
    return {
      url,
      valid: result.valid,
      error: result.error
    };
  });
}

export default {
  validateUrl,
  validatePageReference,
  validateMenuItemUrl,
  validateUrls,
  DANGEROUS_DOMAINS,
  MALICIOUS_PATTERNS
};