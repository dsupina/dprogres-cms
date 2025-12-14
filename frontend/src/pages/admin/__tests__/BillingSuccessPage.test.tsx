import { describe, it, vi, expect, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BillingSuccessPage from '../BillingSuccessPage';

// Mock react-router-dom navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('BillingSuccessPage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderWithProviders = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <BillingSuccessPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('renders success message', () => {
    renderWithProviders();

    expect(screen.getByText('Subscription Activated!')).toBeInTheDocument();
    expect(
      screen.getByText(/thank you for your subscription/i)
    ).toBeInTheDocument();
  });

  it('shows countdown timer', () => {
    renderWithProviders();

    expect(
      screen.getByText(/redirecting to billing page in 5 seconds/i)
    ).toBeInTheDocument();
  });

  it('displays Go to Billing link', () => {
    renderWithProviders();

    const billingLink = screen.getByRole('link', { name: /go to billing/i });
    expect(billingLink).toBeInTheDocument();
    expect(billingLink).toHaveAttribute('href', '/admin/billing');
  });

  it('shows what\'s next section', () => {
    renderWithProviders();

    expect(screen.getByText("What's next?")).toBeInTheDocument();
    expect(
      screen.getByText(/your new plan limits are now active/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/you'll receive a confirmation email shortly/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/view your invoice in the billing dashboard/i)
    ).toBeInTheDocument();
  });

  it('countdown decrements every second', async () => {
    renderWithProviders();

    expect(
      screen.getByText(/redirecting to billing page in 5 seconds/i)
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(
      screen.getByText(/redirecting to billing page in 4 seconds/i)
    ).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(
      screen.getByText(/redirecting to billing page in 3 seconds/i)
    ).toBeInTheDocument();
  });

  it('navigates to billing page after countdown completes', async () => {
    renderWithProviders();

    // Advance through all 5 seconds
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/admin/billing');
  });

  it('invalidates billing queries on mount', () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    renderWithProviders();

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['billing-subscription'],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['billing-usage'],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['billing-invoices'],
    });
  });

  it('displays success check icon', () => {
    renderWithProviders();

    // The success icon container has specific styling
    const iconContainer = document.querySelector('.bg-green-100');
    expect(iconContainer).toBeInTheDocument();
  });
});
