import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import SitesPage from '../SitesPage';
import * as sitesService from '../../../services/sites';
import * as domainsService from '../../../services/domains';

// Mock dependencies
jest.mock('../../../services/sites');
jest.mock('../../../services/domains');
jest.mock('react-hot-toast');

const mockSitesService = sitesService as jest.Mocked<typeof sitesService>;
const mockDomainsService = domainsService as jest.Mocked<typeof domainsService>;
const mockToast = toast as jest.Mocked<typeof toast>;

// Mock AdminLayout
jest.mock('../../../components/admin/AdminLayout', () => {
  return function MockAdminLayout({ children }: { children: React.ReactNode }) {
    return <div data-testid="admin-layout">{children}</div>;
  };
});

// Mock Modal
jest.mock('../../../components/ui/Modal', () => {
  return function MockModal({
    title,
    children,
    onClose
  }: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
  }) {
    return (
      <div data-testid="modal">
        <div data-testid="modal-title">{title}</div>
        <button onClick={onClose} data-testid="modal-close">Close</button>
        {children}
      </div>
    );
  };
});

// Mock DataTable
jest.mock('../../../components/ui/DataTable', () => {
  return function MockDataTable({
    data,
    columns,
    actions
  }: {
    data: any[];
    columns: any[];
    actions: any[];
  }) {
    return (
      <div data-testid="data-table">
        {data.map((item, index) => (
          <div key={index} data-testid={`table-row-${index}`}>
            <span data-testid={`site-name-${index}`}>{item.name}</span>
            <span data-testid={`site-domain-${index}`}>{item.domain_hostname}</span>
            <span data-testid={`site-path-${index}`}>{item.base_path}</span>
            {actions.map((action, actionIndex) => (
              <button
                key={actionIndex}
                onClick={() => action.onClick(item)}
                data-testid={`action-${action.label.toLowerCase()}-${index}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </BrowserRouter>
  );
};

const mockSites = [
  {
    id: 1,
    domain_id: 1,
    name: 'Main Site',
    base_path: '/',
    title: 'Main Site Title',
    description: 'Main site description',
    is_default: true,
    is_active: true,
    settings: {},
    domain_hostname: 'example.com',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  },
  {
    id: 2,
    domain_id: 1,
    name: 'Blog Site',
    base_path: '/blog',
    title: 'Blog Site Title',
    description: 'Blog site description',
    is_default: false,
    is_active: true,
    settings: {},
    domain_hostname: 'example.com',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  }
];

const mockDomains = [
  {
    id: 1,
    hostname: 'example.com',
    is_verified: true,
    is_active: true
  },
  {
    id: 2,
    hostname: 'blog.example.com',
    is_verified: true,
    is_active: true
  }
];

describe('SitesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSitesService.fetchSites.mockResolvedValue(mockSites);
    mockDomainsService.fetchDomains.mockResolvedValue(mockDomains);
    mockSitesService.createSite.mockResolvedValue({
      id: 3,
      domain_id: 1,
      name: 'New Site',
      base_path: '/new',
      is_default: false,
      is_active: true,
      domain_hostname: 'example.com',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    });
  });

  it('renders sites management page with site list', async () => {
    render(<SitesPage />, { wrapper: createWrapper() });

    expect(screen.getByText('Sites Management')).toBeInTheDocument();
    expect(screen.getByText('Manage sites for your domains with custom base paths and menus')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    expect(screen.getByTestId('site-name-0')).toHaveTextContent('Main Site');
    expect(screen.getByTestId('site-domain-0')).toHaveTextContent('example.com');
    expect(screen.getByTestId('site-path-0')).toHaveTextContent('/');

    expect(screen.getByTestId('site-name-1')).toHaveTextContent('Blog Site');
    expect(screen.getByTestId('site-path-1')).toHaveTextContent('/blog');
  });

  it('shows loading spinner while fetching sites', () => {
    mockSitesService.fetchSites.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(mockSites), 100))
    );

    render(<SitesPage />, { wrapper: createWrapper() });

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument(); // spinner
  });

  it('opens create modal when Add Site button is clicked', async () => {
    render(<SitesPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Site'));

    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-title')).toHaveTextContent('Create New Site');
  });

  it('opens edit modal when Edit action is clicked', async () => {
    render(<SitesPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('action-edit-0'));

    expect(screen.getByTestId('modal')).toBeInTheDocument();
    expect(screen.getByTestId('modal-title')).toHaveTextContent('Edit Site');

    // Check form is pre-filled
    expect(screen.getByDisplayValue('Main Site')).toBeInTheDocument();
    expect(screen.getByDisplayValue('/')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Main Site Title')).toBeInTheDocument();
  });

  it('creates a new site successfully', async () => {
    render(<SitesPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    // Open create modal
    fireEvent.click(screen.getByText('Add Site'));

    // Fill form
    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Site Name'), { target: { value: 'New Test Site' } });
    fireEvent.change(screen.getByLabelText('Base Path'), { target: { value: '/test' } });
    fireEvent.change(screen.getByLabelText('Site Title'), { target: { value: 'Test Title' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Test description' } });

    // Submit form
    fireEvent.click(screen.getByText('Create Site'));

    await waitFor(() => {
      expect(mockSitesService.createSite).toHaveBeenCalledWith({
        domain_id: 1,
        name: 'New Test Site',
        base_path: '/test',
        title: 'Test Title',
        description: 'Test description',
        is_default: false,
        is_active: true
      });
    });

    expect(mockToast.success).toHaveBeenCalledWith('Site created successfully');
  });

  it('updates an existing site successfully', async () => {
    mockSitesService.updateSite.mockResolvedValue({
      ...mockSites[0],
      name: 'Updated Main Site',
      title: 'Updated Title'
    });

    render(<SitesPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    // Open edit modal
    fireEvent.click(screen.getByTestId('action-edit-0'));

    // Update form
    fireEvent.change(screen.getByDisplayValue('Main Site'), { target: { value: 'Updated Main Site' } });
    fireEvent.change(screen.getByDisplayValue('Main Site Title'), { target: { value: 'Updated Title' } });

    // Submit form
    fireEvent.click(screen.getByText('Update Site'));

    await waitFor(() => {
      expect(mockSitesService.updateSite).toHaveBeenCalledWith(1, {
        domain_id: 1,
        name: 'Updated Main Site',
        base_path: '/',
        title: 'Updated Title',
        description: 'Main site description',
        is_default: true,
        is_active: true
      });
    });

    expect(mockToast.success).toHaveBeenCalledWith('Site updated successfully');
  });

  it('deletes a site with confirmation', async () => {
    // Mock window.confirm
    const mockConfirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    mockSitesService.deleteSite.mockResolvedValue();

    render(<SitesPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('action-delete-0'));

    expect(mockConfirm).toHaveBeenCalledWith('Are you sure you want to delete the site "Main Site"?');
    expect(mockSitesService.deleteSite).toHaveBeenCalledWith(1);

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Site deleted successfully');
    });

    mockConfirm.mockRestore();
  });

  it('handles create site error', async () => {
    const errorResponse = {
      response: {
        data: { error: 'A site with this base path already exists for this domain' }
      }
    };
    mockSitesService.createSite.mockRejectedValue(errorResponse);

    render(<SitesPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    // Open create modal and submit
    fireEvent.click(screen.getByText('Add Site'));
    fireEvent.change(screen.getByLabelText('Domain'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Site Name'), { target: { value: 'Duplicate Site' } });
    fireEvent.click(screen.getByText('Create Site'));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        'A site with this base path already exists for this domain'
      );
    });
  });

  it('handles update site error', async () => {
    const errorResponse = {
      response: {
        data: { error: 'Failed to update site' }
      }
    };
    mockSitesService.updateSite.mockRejectedValue(errorResponse);

    render(<SitesPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    // Open edit modal and submit
    fireEvent.click(screen.getByTestId('action-edit-0'));
    fireEvent.click(screen.getByText('Update Site'));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to update site');
    });
  });

  it('handles delete site error', async () => {
    const mockConfirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const errorResponse = {
      response: {
        data: { error: 'Cannot delete the last site for a domain' }
      }
    };
    mockSitesService.deleteSite.mockRejectedValue(errorResponse);

    render(<SitesPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('action-delete-0'));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Cannot delete the last site for a domain');
    });

    mockConfirm.mockRestore();
  });

  it('closes modal when Cancel button is clicked', async () => {
    render(<SitesPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Site'));
    expect(screen.getByTestId('modal')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('closes modal when close button is clicked', async () => {
    render(<SitesPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Site'));
    expect(screen.getByTestId('modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('navigates to menu management when Manage Menu action is clicked', async () => {
    // Mock window.location.href
    const mockLocationHref = jest.spyOn(window.location, 'href', 'set').mockImplementation(() => {});

    render(<SitesPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('action-manage menu-0'));

    expect(mockLocationHref).toHaveBeenCalledWith('/admin/sites/1/menus');

    mockLocationHref.mockRestore();
  });

  it('renders form with correct validation attributes', async () => {
    render(<SitesPage />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add Site'));

    const basePathInput = screen.getByLabelText('Base Path');
    expect(basePathInput).toHaveAttribute('pattern', '^/([a-z0-9-_/]*)?$');
    expect(basePathInput).toHaveAttribute('required');
    expect(basePathInput).toHaveAttribute('placeholder', '/');

    const domainSelect = screen.getByLabelText('Domain');
    expect(domainSelect).toHaveAttribute('required');

    const nameInput = screen.getByLabelText('Site Name');
    expect(nameInput).toHaveAttribute('required');
  });
});