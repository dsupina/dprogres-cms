import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

interface CSRFRequest extends Request {
  csrfToken?: string;
}

/**
 * CSRF Protection Middleware using Double Submit Cookie pattern
 * Prevents Cross-Site Request Forgery attacks
 */

// Generate a secure random token
export const generateCSRFToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// Store for CSRF tokens (in production, use Redis or similar)
// Using memory store for now with cleanup
const tokenStore = new Map<string, { token: string; timestamp: number }>();
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Cleanup expired tokens
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of tokenStore.entries()) {
    if (now - value.timestamp > TOKEN_EXPIRY) {
      tokenStore.delete(key);
    }
  }
}, 60 * 60 * 1000); // Cleanup every hour

/**
 * Middleware to generate and set CSRF token
 */
export const csrfGenerate = (req: CSRFRequest, res: Response, next: NextFunction) => {
  // Generate token for session if not exists
  const sessionId = req.session?.id || req.cookies?.sessionId || generateCSRFToken();

  let tokenData = tokenStore.get(sessionId);

  if (!tokenData || Date.now() - tokenData.timestamp > TOKEN_EXPIRY) {
    const token = generateCSRFToken();
    tokenData = { token, timestamp: Date.now() };
    tokenStore.set(sessionId, tokenData);
  }

  // Set token in response header for client to read
  res.setHeader('X-CSRF-Token', tokenData.token);

  // Also set as httpOnly=false cookie so JS can read it
  res.cookie('csrf-token', tokenData.token, {
    httpOnly: false, // Must be false so JS can read it
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TOKEN_EXPIRY
  });

  req.csrfToken = tokenData.token;
  next();
};

/**
 * Middleware to validate CSRF token on state-changing requests
 */
export const csrfProtect = (req: CSRFRequest, res: Response, next: NextFunction) => {
  // Skip validation for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const sessionId = req.session?.id || req.cookies?.sessionId;
  if (!sessionId) {
    return res.status(403).json({ error: 'Invalid session' });
  }

  const storedTokenData = tokenStore.get(sessionId);
  if (!storedTokenData) {
    return res.status(403).json({ error: 'CSRF token not found' });
  }

  // Check if token is expired
  if (Date.now() - storedTokenData.timestamp > TOKEN_EXPIRY) {
    tokenStore.delete(sessionId);
    return res.status(403).json({ error: 'CSRF token expired' });
  }

  // Get token from request (try multiple sources)
  const tokenFromHeader = req.headers['x-csrf-token'] as string;
  const tokenFromBody = req.body?._csrf;
  const tokenFromQuery = req.query?._csrf as string;

  const requestToken = tokenFromHeader || tokenFromBody || tokenFromQuery;

  if (!requestToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  // Validate token using constant-time comparison
  if (!safeCompare(requestToken, storedTokenData.token)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
};

/**
 * Constant-time string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

export default {
  generate: csrfGenerate,
  protect: csrfProtect,
  generateToken: generateCSRFToken
};