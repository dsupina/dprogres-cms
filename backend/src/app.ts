/**
 * Express App Configuration
 * Separated from index.ts to allow OpenTelemetry instrumentation to load first
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';

// Import routes (webhooksRoutes loads config/stripe which validates env vars)
import authRoutes from './routes/auth';
import postsRoutes from './routes/posts';
import categoriesRoutes from './routes/categories';
import pagesRoutes from './routes/pages';
import mediaRoutes from './routes/media';
import settingsRoutes from './routes/settings';
import adminRoutes from './routes/admin';
import templatesAdminRoutes from './routes/templates';
import domainsRoutes from './routes/domains';
import menusRoutes from './routes/menus';
import sitesRoutes from './routes/sites';
import versionsRoutes from './routes/versions_simple';
import autosaveRoutes from './routes/autosave';
import { createVersionRoutes } from './routes/versions';
import webhooksRoutes from './routes/webhooks';
import quotasRoutes from './routes/quotas';
import billingRoutes from './routes/billing';
import organizationsRoutes from './routes/organizations';
import metricsRoutes from './routes/metrics';

// Import domain middleware
import { validateDomain, resolveDomain } from './middleware/domainValidation';
import { siteResolver } from './middleware/siteResolver';

// Import database pool
import pool from './utils/database';

const app = express();

// Trust proxy (needed for rate limiting behind nginx)
app.set('trust proxy', 1);

// Rate limiting
const isLocalIp = (ip?: string) => {
  if (!ip) return false;
  // handle formats like ::ffff:127.0.0.1
  const normalized = ip.replace('::ffff:', '');
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.startsWith('127.') ||
    /^10\./.test(normalized) ||
    /^192\.168\./.test(normalized) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(normalized)
  );
};

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 600 : 0, // disable in non-prod (0 => skip via handler below)
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please wait a moment and retry.',
  skip: (req) => process.env.NODE_ENV !== 'production' || isLocalIp(req.ip),
  handler: (req, res /*, next*/) => {
    res.status(429).json({ error: 'Too many requests. Please wait a moment and retry.' });
  },
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      // Allow local uploads and external HTTPS/HTTP images
      imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(compression());
app.use(morgan('combined'));
app.use(limiter);

// Webhook route MUST come before express.json() to preserve raw body for signature verification
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhooksRoutes);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Domain validation and resolution middleware
// Skip for health check, static files, and webhooks
app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path.startsWith('/uploads') || req.path.startsWith('/api/webhooks')) {
    return next();
  }
  validateDomain(req, res, next);
});

app.use((req, res, next) => {
  if (req.path === '/api/health' || req.path.startsWith('/uploads') || req.path.startsWith('/api/webhooks')) {
    return next();
  }
  resolveDomain(req, res, next);
});

// Site resolution middleware (feature flagged)
const DOMAINS_SITES_ENABLED = process.env.DOMAINS_SITES_ENABLED || 'off';
if (DOMAINS_SITES_ENABLED !== 'off') {
  app.use((req, res, next) => {
    if (req.path === '/api/health' || req.path.startsWith('/uploads') || req.path.startsWith('/api/admin')) {
      return next();
    }
    siteResolver(req, res, next);
  });
}

// Serve uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/templates', templatesAdminRoutes);
app.use('/api/admin/domains', domainsRoutes);
app.use('/api/admin/sites', sitesRoutes);
app.use('/api/menus', menusRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api', versionsRoutes); // Version endpoints at /api/content and /api/versions
app.use('/api', autosaveRoutes); // Auto-save endpoints
app.use('/api/versions', createVersionRoutes(pool)); // Version comparison endpoints
app.use('/api/quotas', quotasRoutes); // Quota management endpoints
app.use('/api/billing', billingRoutes); // Billing and subscription endpoints
app.use('/api/organizations', organizationsRoutes); // Organization settings and member management
app.use('/api/metrics', metricsRoutes); // SF-026: Monitoring metrics and alerts

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'CMS API is running' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

export default app;
