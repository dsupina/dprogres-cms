import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { subscriptionService } from '../services/SubscriptionService';
import { quotaService } from '../services/QuotaService';
import { pool } from '../utils/database';
import { stripe } from '../config/stripe';
import Joi from 'joi';

const router = Router();

/**
 * Plan pricing configuration
 * These are display prices - actual billing happens through Stripe
 */
const PLAN_PRICING = {
  free: { monthly: 0, annual: 0, name: 'Free' },
  starter: { monthly: 29, annual: 290, name: 'Starter' },
  pro: { monthly: 99, annual: 990, name: 'Pro' },
  enterprise: { monthly: 299, annual: 2990, name: 'Enterprise' },
};

/**
 * Quota limits by plan tier
 */
const PLAN_QUOTAS = {
  free: { sites: 1, posts: 100, users: 1, storage_bytes: 1073741824, api_calls: 10000 },
  starter: { sites: 3, posts: 1000, users: 5, storage_bytes: 10737418240, api_calls: 100000 },
  pro: { sites: 10, posts: 10000, users: 25, storage_bytes: 107374182400, api_calls: 1000000 },
  enterprise: { sites: -1, posts: -1, users: -1, storage_bytes: -1, api_calls: -1 }, // Unlimited
};

/**
 * GET /api/billing/subscription
 * Get current subscription for authenticated user's organization
 */
router.get('/subscription', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'No organization associated with user',
      });
    }

    // Get subscription from service
    const result = await subscriptionService.getCurrentSubscription(organizationId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    // Get organization details for fallback
    const { rows: orgs } = await pool.query(
      'SELECT name, plan_tier FROM organizations WHERE id = $1',
      [organizationId]
    );

    const org = orgs[0];
    const subscription = result.data;

    // Build response with subscription data or free tier defaults
    const planTier = subscription?.plan_tier || org?.plan_tier || 'free';
    const pricing = PLAN_PRICING[planTier as keyof typeof PLAN_PRICING] || PLAN_PRICING.free;

    const response = {
      success: true,
      data: {
        has_subscription: !!subscription,
        plan_tier: planTier,
        plan_name: pricing.name,
        billing_cycle: subscription?.billing_cycle || 'monthly',
        status: subscription?.status || 'active',
        current_period_start: subscription?.current_period_start || null,
        current_period_end: subscription?.current_period_end || null,
        cancel_at_period_end: subscription?.cancel_at_period_end || false,
        canceled_at: subscription?.canceled_at || null,
        amount_cents: subscription?.amount_cents || pricing.monthly * 100,
        price_display: subscription
          ? `$${(subscription.amount_cents / 100).toFixed(0)}/${subscription.billing_cycle === 'annual' ? 'year' : 'month'}`
          : 'Free',
        organization_name: org?.name || 'Unknown',
      },
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting subscription:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve subscription',
    });
  }
});

/**
 * GET /api/billing/invoices
 * Get invoice history for authenticated user's organization
 */
router.get('/invoices', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'No organization associated with user',
      });
    }

    // Parse query params
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const page = parseInt(req.query.page as string) || 1;
    const offset = (page - 1) * limit;

    // Get invoices from database
    const { rows: invoices } = await pool.query(
      `SELECT
        id,
        stripe_invoice_id,
        amount_cents,
        amount_paid_cents,
        currency,
        status,
        invoice_pdf_url,
        hosted_invoice_url,
        billing_reason,
        period_start,
        period_end,
        created_at,
        paid_at
       FROM invoices
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset]
    );

    // Get total count
    const { rows: countResult } = await pool.query(
      'SELECT COUNT(*) as total FROM invoices WHERE organization_id = $1',
      [organizationId]
    );
    const total = parseInt(countResult[0].total);

    // Transform invoices for display
    const transformedInvoices = invoices.map((inv) => ({
      id: inv.id,
      invoice_number: inv.stripe_invoice_id,
      amount: `$${(inv.amount_cents / 100).toFixed(2)}`,
      amount_cents: inv.amount_cents,
      currency: inv.currency?.toUpperCase() || 'USD',
      status: inv.status,
      status_display: inv.status.charAt(0).toUpperCase() + inv.status.slice(1),
      pdf_url: inv.invoice_pdf_url,
      hosted_url: inv.hosted_invoice_url,
      billing_reason: inv.billing_reason,
      period_start: inv.period_start,
      period_end: inv.period_end,
      created_at: inv.created_at,
      paid_at: inv.paid_at,
    }));

    res.json({
      success: true,
      data: {
        invoices: transformedInvoices,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
          has_more: offset + invoices.length < total,
        },
      },
    });
  } catch (error: any) {
    console.error('Error getting invoices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve invoices',
    });
  }
});

/**
 * GET /api/billing/usage
 * Get quota usage for authenticated user's organization
 */
router.get('/usage', authenticateToken, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'No organization associated with user',
      });
    }

    // Get quota status from service
    const result = await quotaService.getQuotaStatus(organizationId);

    if (!result.success) {
      return res.status(500).json(result);
    }

    // Get organization plan for context
    const { rows: orgs } = await pool.query(
      'SELECT plan_tier FROM organizations WHERE id = $1',
      [organizationId]
    );
    const planTier = orgs[0]?.plan_tier || 'free';

    // Transform quota data for display
    const quotaData = result.data!;
    const dimensionLabels: Record<string, string> = {
      sites: 'Sites',
      posts: 'Posts',
      users: 'Team Members',
      storage_bytes: 'Storage',
      api_calls: 'API Calls',
    };

    const usageItems = Object.entries(quotaData).map(([dimension, status]) => {
      const isUnlimited = status.quota_limit === -1 || status.quota_limit >= 1099511627776; // 1TB threshold for "unlimited"

      // Format values for display
      let currentDisplay: string;
      let limitDisplay: string;

      if (dimension === 'storage_bytes') {
        currentDisplay = formatBytes(status.current_usage);
        limitDisplay = isUnlimited ? 'Unlimited' : formatBytes(status.quota_limit);
      } else if (dimension === 'api_calls') {
        currentDisplay = formatNumber(status.current_usage);
        limitDisplay = isUnlimited ? 'Unlimited' : formatNumber(status.quota_limit);
      } else {
        currentDisplay = status.current_usage.toString();
        limitDisplay = isUnlimited ? 'Unlimited' : status.quota_limit.toString();
      }

      return {
        dimension,
        label: dimensionLabels[dimension] || dimension,
        current: status.current_usage,
        limit: status.quota_limit,
        remaining: status.remaining,
        percentage: isUnlimited ? 0 : status.percentage_used,
        current_display: currentDisplay,
        limit_display: limitDisplay,
        is_unlimited: isUnlimited,
        is_warning: !isUnlimited && status.percentage_used >= 80,
        is_critical: !isUnlimited && status.percentage_used >= 95,
      };
    });

    res.json({
      success: true,
      data: {
        plan_tier: planTier,
        usage: usageItems,
      },
    });
  } catch (error: any) {
    console.error('Error getting usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage data',
    });
  }
});

/**
 * POST /api/billing/portal
 * Get Stripe Customer Portal URL
 */
router.post('/portal', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Default return URL to billing page
    const returnUrl = req.body.return_url || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/billing`;

    const result = await subscriptionService.getCustomerPortalUrl(
      organizationId,
      userId,
      returnUrl
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      data: {
        portal_url: result.data!.portalUrl,
      },
    });
  } catch (error: any) {
    console.error('Error creating portal session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create billing portal session',
    });
  }
});

/**
 * POST /api/billing/checkout
 * Create Stripe Checkout session for plan upgrade
 */
const checkoutSchema = Joi.object({
  plan_tier: Joi.string().valid('starter', 'pro').required(),
  billing_cycle: Joi.string().valid('monthly', 'annual').required(),
  trial_days: Joi.number().integer().min(0).max(30).optional(),
});

router.post('/checkout', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Validate request body
    const { error, value } = checkoutSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message,
      });
    }

    const { plan_tier, billing_cycle, trial_days } = value;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const result = await subscriptionService.createCheckoutSession({
      organizationId,
      planTier: plan_tier,
      billingCycle: billing_cycle,
      userId,
      successUrl: `${baseUrl}/admin/billing?checkout=success`,
      cancelUrl: `${baseUrl}/admin/billing?checkout=canceled`,
      trialDays: trial_days,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      data: {
        session_id: result.data!.sessionId,
        checkout_url: result.data!.sessionUrl,
      },
    });
  } catch (error: any) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create checkout session',
    });
  }
});

/**
 * GET /api/billing/plans
 * Get available plans and pricing
 */
router.get('/plans', async (req: Request, res: Response) => {
  try {
    const plans = [
      {
        tier: 'free',
        name: 'Free',
        description: 'Perfect for getting started',
        price_monthly: 0,
        price_annual: 0,
        features: [
          '1 Site',
          '100 Posts',
          '1 Team Member',
          '1 GB Storage',
          '10,000 API Calls/month',
        ],
        quotas: PLAN_QUOTAS.free,
        is_popular: false,
      },
      {
        tier: 'starter',
        name: 'Starter',
        description: 'For small teams and growing sites',
        price_monthly: 29,
        price_annual: 290,
        features: [
          '3 Sites',
          '1,000 Posts',
          '5 Team Members',
          '10 GB Storage',
          '100,000 API Calls/month',
          'Priority Support',
        ],
        quotas: PLAN_QUOTAS.starter,
        is_popular: true,
      },
      {
        tier: 'pro',
        name: 'Pro',
        description: 'For larger teams with advanced needs',
        price_monthly: 99,
        price_annual: 990,
        features: [
          '10 Sites',
          '10,000 Posts',
          '25 Team Members',
          '100 GB Storage',
          '1,000,000 API Calls/month',
          'Priority Support',
          'Advanced Analytics',
          'Custom Domains',
        ],
        quotas: PLAN_QUOTAS.pro,
        is_popular: false,
      },
      {
        tier: 'enterprise',
        name: 'Enterprise',
        description: 'For organizations with custom requirements',
        price_monthly: null,
        price_annual: null,
        features: [
          'Unlimited Sites',
          'Unlimited Posts',
          'Unlimited Team Members',
          'Unlimited Storage',
          'Unlimited API Calls',
          'Dedicated Support',
          'SLA Agreement',
          'Custom Integrations',
          'On-premise Option',
        ],
        quotas: PLAN_QUOTAS.enterprise,
        is_popular: false,
        contact_sales: true,
      },
    ];

    res.json({
      success: true,
      data: { plans },
    });
  } catch (error: any) {
    console.error('Error getting plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve plans',
    });
  }
});

/**
 * Helper function to format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return 'Unlimited';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Helper function to format large numbers
 */
function formatNumber(num: number): string {
  if (num < 0) return 'Unlimited';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export default router;
