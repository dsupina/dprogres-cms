/**
 * Sentry Error Tracking Configuration (SF-026)
 *
 * Optional Sentry integration for production error monitoring.
 * If SENTRY_DSN is not configured, gracefully degrades to console logging.
 *
 * Environment Variables:
 * - SENTRY_DSN: Sentry Data Source Name (required for Sentry to work)
 * - NODE_ENV: Used to set environment in Sentry
 * - npm_package_version: Used to set release version
 *
 * @example
 * ```typescript
 * import { initSentry, captureException, captureMessage } from './config/sentry';
 *
 * // Initialize at app startup
 * initSentry();
 *
 * // Capture an exception
 * try {
 *   doSomething();
 * } catch (error) {
 *   captureException(error, { userId: 123, action: 'doSomething' });
 * }
 *
 * // Capture a message
 * captureMessage('Something important happened', 'info');
 * ```
 */

// Sentry types (for when SDK is installed)
type SeverityLevel = 'fatal' | 'error' | 'warning' | 'log' | 'info' | 'debug';

interface SentryContext {
  [key: string]: any;
}

// Check if Sentry SDK is available
let Sentry: any = null;
let isSentryInitialized = false;

/**
 * Initialize Sentry error tracking
 * Safe to call even if Sentry SDK is not installed
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.log('[Sentry] SENTRY_DSN not configured, error tracking disabled');
    return false;
  }

  try {
    // Dynamically import Sentry SDK
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Sentry = require('@sentry/node');

    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.npm_package_version || '1.0.0',

      // Performance monitoring sample rate (0.0 to 1.0)
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

      // Error sample rate
      sampleRate: 1.0,

      // Attach stack traces to all messages
      attachStacktrace: true,

      // Don't send in test environment
      enabled: process.env.NODE_ENV !== 'test',

      // Custom error filtering
      beforeSend(event: any, hint: any) {
        // Filter out known non-critical errors
        const error = hint?.originalException as Error | undefined;
        if (error?.message?.includes('ECONNRESET')) {
          return null; // Don't send connection resets
        }
        return event;
      },
    });

    isSentryInitialized = true;
    console.log('[Sentry] Initialized for environment:', process.env.NODE_ENV || 'development');
    return true;
  } catch (error) {
    // Sentry SDK not installed - this is expected in development
    console.log('[Sentry] SDK not available, error tracking disabled');
    return false;
  }
}

/**
 * Capture an exception in Sentry
 * Falls back to console.error if Sentry is not available
 */
export function captureException(
  error: Error | unknown,
  context?: SentryContext
): string | undefined {
  // Always log to console
  console.error('[Error]', error, context);

  if (Sentry && isSentryInitialized) {
    return Sentry.captureException(error, {
      extra: context,
    });
  }

  return undefined;
}

/**
 * Capture a message in Sentry
 * Falls back to console.log if Sentry is not available
 */
export function captureMessage(
  message: string,
  level: SeverityLevel = 'info',
  context?: SentryContext
): string | undefined {
  // Log to console based on level
  const logFn =
    level === 'error' || level === 'fatal'
      ? console.error
      : level === 'warning'
      ? console.warn
      : console.log;
  logFn(`[${level.toUpperCase()}] ${message}`, context);

  if (Sentry && isSentryInitialized) {
    return Sentry.captureMessage(message, {
      level,
      extra: context,
    });
  }

  return undefined;
}

/**
 * Set user context for subsequent events
 */
export function setUser(user: { id?: number | string; email?: string; username?: string } | null): void {
  if (Sentry && isSentryInitialized) {
    Sentry.setUser(user);
  }
}

/**
 * Set extra context for subsequent events
 */
export function setContext(name: string, context: SentryContext | null): void {
  if (Sentry && isSentryInitialized) {
    Sentry.setContext(name, context);
  }
}

/**
 * Set a tag for subsequent events
 */
export function setTag(key: string, value: string): void {
  if (Sentry && isSentryInitialized) {
    Sentry.setTag(key, value);
  }
}

/**
 * Add a breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb: {
  category?: string;
  message?: string;
  level?: SeverityLevel;
  data?: Record<string, any>;
}): void {
  if (Sentry && isSentryInitialized) {
    Sentry.addBreadcrumb(breadcrumb);
  }
}

/**
 * Start a transaction for performance monitoring
 */
export function startTransaction(name: string, op: string): any {
  if (Sentry && isSentryInitialized) {
    return Sentry.startTransaction({ name, op });
  }
  return null;
}

/**
 * Get Sentry request handler middleware (for Express)
 */
export function getRequestHandler(): any {
  if (Sentry && isSentryInitialized) {
    return Sentry.Handlers.requestHandler();
  }
  // Return no-op middleware
  return (_req: any, _res: any, next: any) => next();
}

/**
 * Get Sentry error handler middleware (for Express)
 */
export function getErrorHandler(): any {
  if (Sentry && isSentryInitialized) {
    return Sentry.Handlers.errorHandler();
  }
  // Return no-op middleware
  return (err: any, _req: any, _res: any, next: any) => next(err);
}

/**
 * Check if Sentry is enabled and initialized
 */
export function isSentryEnabled(): boolean {
  return isSentryInitialized;
}

/**
 * Flush Sentry events (useful before process exit)
 */
export async function flush(timeout: number = 2000): Promise<boolean> {
  if (Sentry && isSentryInitialized) {
    return Sentry.flush(timeout);
  }
  return true;
}
