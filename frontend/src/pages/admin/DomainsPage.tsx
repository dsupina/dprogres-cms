import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, CheckCircle, XCircle, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { domainsService, Domain, CreateDomainData, UpdateDomainData } from '../../services/domains';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import LoadingSpinner from '../../components/ui/LoadingSpinner';

const DomainsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isAddingDomain, setIsAddingDomain] = useState(false);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  const [formData, setFormData] = useState<CreateDomainData | UpdateDomainData>({
    hostname: '',
    ip_address: '',
    is_active: true,
    is_default: false
  });

  const { data: domains, isPending } = useQuery({
    queryKey: ['domains'],
    queryFn: () => domainsService.getAll(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateDomainData) => domainsService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success('Domain created successfully');
      setIsAddingDomain(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create domain');
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; updates: UpdateDomainData }) =>
      domainsService.update(data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success('Domain updated successfully');
      setEditingDomain(null);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update domain');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => domainsService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
      toast.success('Domain deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete domain');
    }
  });

  const resetForm = () => {
    setFormData({
      hostname: '',
      ip_address: '',
      is_active: true,
      is_default: false
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingDomain) {
      updateMutation.mutate({ id: editingDomain.id, updates: formData });
    } else {
      createMutation.mutate(formData as CreateDomainData);
    }
  };

  const handleEdit = (domain: Domain) => {
    setEditingDomain(domain);
    setFormData({
      hostname: domain.hostname,
      ip_address: domain.ip_address || '',
      is_active: domain.is_active,
      is_default: domain.is_default
    });
    setIsAddingDomain(true);
  };

  const handleDelete = (domain: Domain) => {
    if (domain.is_default) {
      toast.error('Cannot delete the default domain');
      return;
    }
    if (window.confirm(`Are you sure you want to delete ${domain.hostname}?`)) {
      deleteMutation.mutate(domain.id);
    }
  };

  const handleCancel = () => {
    setIsAddingDomain(false);
    setEditingDomain(null);
    resetForm();
  };

  if (isPending) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Domain Management</h1>
        {!isAddingDomain && (
          <Button onClick={() => setIsAddingDomain(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Domain
          </Button>
        )}
      </div>

      {isAddingDomain && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">
            {editingDomain ? 'Edit Domain' : 'Add New Domain'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Hostname"
              value={formData.hostname || ''}
              onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
              placeholder="example.com"
              required
              pattern="^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$"
              title="Enter a valid hostname (e.g., example.com)"
            />

            <Input
              label="IP Address (Optional)"
              value={formData.ip_address || ''}
              onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
              placeholder="192.168.1.1"
            />

            <div className="flex items-center space-x-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="mr-2"
                />
                <span>Active</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="mr-2"
                />
                <span>Default Domain</span>
              </label>
            </div>

            <div className="flex space-x-3">
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingDomain ? 'Update' : 'Create'} Domain
              </Button>
              <Button type="button" variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Hostname
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                IP Address
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Default
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Verified
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {domains?.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No domains configured. Add your first domain to get started.
                </td>
              </tr>
            ) : (
              domains?.map((domain) => (
                <tr key={domain.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{domain.hostname}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {domain.ip_address || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {domain.is_active ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <XCircle className="w-3 h-3 mr-1" />
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {domain.is_default && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Default
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {domain.verified_at ? (
                      <span className="inline-flex items-center text-green-600">
                        <CheckCircle className="w-4 h-4" />
                      </span>
                    ) : (
                      <button
                        className="inline-flex items-center text-yellow-600 hover:text-yellow-700"
                        title="Click to view verification instructions"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleEdit(domain)}
                      className="text-indigo-600 hover:text-indigo-900 mr-3"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {!domain.is_default && (
                      <button
                        onClick={() => handleDelete(domain)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DomainsPage;