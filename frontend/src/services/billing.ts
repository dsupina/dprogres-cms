import api from '@/lib/api';

// Types
export interface SubscriptionData {
  has_subscription: boolean;
  plan_tier: 'free' | 'starter' | 'pro' | 'enterprise';
  plan_name: string;
  billing_cycle: 'monthly' | 'annual';
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete' | 'incomplete_expired' | 'unpaid';
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  amount_cents: number;
  price_display: string;
  organization_name: string;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  amount: string;
  amount_cents: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  status_display: string;
  pdf_url: string | null;
  hosted_url: string | null;
  billing_reason: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
  paid_at: string | null;
}

export interface InvoicePagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_more: boolean;
}

export interface UsageItem {
  dimension: string;
  label: string;
  current: number;
  limit: number;
  remaining: number;
  percentage: number;
  current_display: string;
  limit_display: string;
  is_unlimited: boolean;
  is_warning: boolean;
  is_critical: boolean;
}

export interface UsageData {
  plan_tier: string;
  usage: UsageItem[];
}

export interface PlanQuotas {
  sites: number;
  posts: number;
  users: number;
  storage_bytes: number;
  api_calls: number;
}

export interface Plan {
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  name: string;
  description: string;
  price_monthly: number | null;
  price_annual: number | null;
  features: string[];
  quotas: PlanQuotas;
  is_popular: boolean;
  contact_sales?: boolean;
}

export interface CheckoutInput {
  plan_tier: 'starter' | 'pro';
  billing_cycle: 'monthly' | 'annual';
  trial_days?: number;
}

// API Response types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Service methods
export const billingService = {
  /**
   * Get current subscription for the authenticated user's organization
   */
  getSubscription: async (): Promise<SubscriptionData> => {
    const response = await api.get<ApiResponse<SubscriptionData>>('/billing/subscription');
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get subscription');
    }
    return response.data.data;
  },

  /**
   * Get invoice history
   */
  getInvoices: async (page = 1, limit = 10): Promise<{ invoices: Invoice[]; pagination: InvoicePagination }> => {
    const response = await api.get<ApiResponse<{ invoices: Invoice[]; pagination: InvoicePagination }>>(
      '/billing/invoices',
      { params: { page, limit } }
    );
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get invoices');
    }
    return response.data.data;
  },

  /**
   * Get usage/quota data
   */
  getUsage: async (): Promise<UsageData> => {
    const response = await api.get<ApiResponse<UsageData>>('/billing/usage');
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get usage data');
    }
    return response.data.data;
  },

  /**
   * Get Stripe Customer Portal URL
   */
  getPortalUrl: async (returnUrl?: string): Promise<string> => {
    const response = await api.post<ApiResponse<{ portal_url: string }>>('/billing/portal', {
      return_url: returnUrl,
    });
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get portal URL');
    }
    return response.data.data.portal_url;
  },

  /**
   * Create Stripe Checkout session for upgrade
   */
  createCheckout: async (input: CheckoutInput): Promise<{ session_id: string; checkout_url: string }> => {
    const response = await api.post<ApiResponse<{ session_id: string; checkout_url: string }>>(
      '/billing/checkout',
      input
    );
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to create checkout session');
    }
    return response.data.data;
  },

  /**
   * Get available plans
   */
  getPlans: async (): Promise<Plan[]> => {
    const response = await api.get<ApiResponse<{ plans: Plan[] }>>('/billing/plans');
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.error || 'Failed to get plans');
    }
    return response.data.data.plans;
  },
};

export default billingService;
