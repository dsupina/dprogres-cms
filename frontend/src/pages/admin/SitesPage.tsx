import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import DataTable from '../../components/ui/DataTable';
import { toast } from 'react-hot-toast';
import { fetchSites, createSite, updateSite, deleteSite } from '../../services/sites';
import { fetchDomains } from '../../services/domains';
import { Edit3, Menu, Trash2 } from 'lucide-react';

interface Site {
  id: number;
  domain_id: number;
  name: string;
  base_path: string;
  title?: string;
  description?: string;
  is_default: boolean;
  is_active: boolean;
  settings?: any;
  domain_hostname?: string;
  created_at: string;
  updated_at: string;
}

interface SiteFormData {
  domain_id: number;
  name: string;
  base_path: string;
  title?: string;
  description?: string;
  is_default?: boolean;
  is_active?: boolean;
}

export default function SitesPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [formData, setFormData] = useState<SiteFormData>({
    domain_id: 0,
    name: '',
    base_path: '/',
    title: '',
    description: '',
    is_default: false,
    is_active: true,
  });

  const queryClient = useQueryClient();

  // Fetch sites
  const { data: sites, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: fetchSites,
  });

  // Fetch domains for dropdown
  const { data: domains } = useQuery({
    queryKey: ['domains'],
    queryFn: fetchDomains,
  });

  // Create site mutation
  const createMutation = useMutation({
    mutationFn: createSite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setShowCreateModal(false);
      resetForm();
      toast.success('Site created successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create site');
    },
  });

  // Update site mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<SiteFormData> }) =>
      updateSite(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      setShowEditModal(false);
      setSelectedSite(null);
      resetForm();
      toast.success('Site updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update site');
    },
  });

  // Delete site mutation
  const deleteMutation = useMutation({
    mutationFn: deleteSite,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast.success('Site deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete site');
    },
  });

  const resetForm = () => {
    setFormData({
      domain_id: 0,
      name: '',
      base_path: '/',
      title: '',
      description: '',
      is_default: false,
      is_active: true,
    });
  };

  const handleEdit = (site: Site) => {
    setSelectedSite(site);
    setFormData({
      domain_id: site.domain_id,
      name: site.name,
      base_path: site.base_path,
      title: site.title || '',
      description: site.description || '',
      is_default: site.is_default,
      is_active: site.is_active,
    });
    setShowEditModal(true);
  };

  const handleDelete = async (site: Site) => {
    if (site.is_default) {
      toast.error('Cannot delete the default site. Please set another site as default first.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete the site "${site.name}"?\n\n` +
      `This action cannot be undone and will remove:\n` +
      `• Site configuration and settings\n` +
      `• Associated menu structures\n` +
      `• Custom domain mappings\n\n` +
      `Type "DELETE" to confirm this permanent action.`
    );

    if (confirmed) {
      deleteMutation.mutate(site.id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (showEditModal && selectedSite) {
      updateMutation.mutate({
        id: selectedSite.id,
        data: formData,
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Site Name',
      render: (value: string) => <span className="font-medium">{value}</span>,
    },
    {
      key: 'domain_hostname',
      label: 'Domain',
      render: (value: string) => <span className="text-sm text-gray-600">{value}</span>,
    },
    {
      key: 'base_path',
      label: 'Base Path',
      render: (value: string) => <code className="text-sm bg-gray-100 px-2 py-1 rounded">{value}</code>,
    },
    {
      key: 'is_default',
      label: 'Default',
      render: (value: boolean) => (
        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
          value ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'
        }`}>
          {value ? 'Default' : ''}
        </span>
      ),
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (value: boolean) => (
        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
          value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {value ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ];

  const actions = [
    {
      label: 'Edit',
      icon: <Edit3 />,
      onClick: handleEdit,
      variant: 'primary' as const,
    },
    {
      label: 'Manage Menu',
      icon: <Menu />,
      onClick: (site: Site) => {
        window.location.href = `/admin/sites/${site.id}/menus`;
      },
      variant: 'secondary' as const,
    },
    {
      label: 'Delete',
      icon: <Trash2 />,
      onClick: handleDelete,
      variant: 'danger' as const,
      disabled: (site: Site) => site.is_default, // Prevent deleting default sites
    },
  ];

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sites Management</h1>
            <p className="text-gray-600 mt-1">
              Manage sites for your domains with custom base paths and menus
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            Add Site
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : (
          <DataTable
            data={sites || []}
            columns={columns}
            actions={actions}
          />
        )}

        {/* Create/Edit Modal */}
        {(showCreateModal || showEditModal) && (
          <Modal
            title={showEditModal ? 'Edit Site' : 'Create New Site'}
            onClose={() => {
              setShowCreateModal(false);
              setShowEditModal(false);
              setSelectedSite(null);
              resetForm();
            }}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Domain
                </label>
                <select
                  value={formData.domain_id}
                  onChange={(e) => setFormData({ ...formData, domain_id: parseInt(e.target.value) })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  required
                  disabled={showEditModal}
                >
                  <option value={0}>Select a domain</option>
                  {domains?.map((domain: any) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.hostname}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Site Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Base Path
                </label>
                <input
                  type="text"
                  value={formData.base_path}
                  onChange={(e) => setFormData({ ...formData, base_path: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="/"
                  pattern="^/([a-z0-9-_/]*)?$"
                  title="Base path must start with / and contain only lowercase letters, numbers, hyphens, and underscores"
                  required
                />
                <p className="mt-1 text-sm text-gray-500">
                  E.g., / for root, /blog for a blog section
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Site Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Set as default site for this domain
                  </span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    Site is active
                  </span>
                </label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowEditModal(false);
                    setSelectedSite(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : showEditModal
                    ? 'Update Site'
                    : 'Create Site'}
                </Button>
              </div>
            </form>
          </Modal>
        )}
    </div>
  );
}