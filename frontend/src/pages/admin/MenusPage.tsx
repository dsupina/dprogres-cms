import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { domainsService } from '../../services/domains';
import MenuBuilder from '../../components/admin/MenuBuilder';
import { Globe, Menu, Copy } from 'lucide-react';
import Button from '../../components/ui/Button';
import { toast } from 'react-hot-toast';
import { menuService } from '../../services/menus';

const MenusPage: React.FC = () => {
  const [selectedDomainId, setSelectedDomainId] = useState<number | null>(null);
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateTargetDomain, setDuplicateTargetDomain] = useState<number | null>(null);

  const { data: domains, isLoading: domainsLoading } = useQuery(
    'domains',
    () => domainsService.getAll(),
    {
      onSuccess: (data) => {
        // Auto-select first domain if none selected
        if (!selectedDomainId && data.length > 0) {
          const defaultDomain = data.find(d => d.is_default) || data[0];
          setSelectedDomainId(defaultDomain.id);
        }
      }
    }
  );

  const handleDuplicateMenu = async () => {
    if (!selectedDomainId || !duplicateTargetDomain) return;

    try {
      await menuService.duplicateMenu(selectedDomainId, duplicateTargetDomain);
      toast.success('Menu duplicated successfully');
      setDuplicateModalOpen(false);
      setDuplicateTargetDomain(null);
    } catch (error) {
      toast.error('Failed to duplicate menu');
    }
  };

  if (domainsLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading domains...</div>
      </div>
    );
  }

  if (!domains || domains.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6 flex items-center">
          <Menu className="mr-3 h-8 w-8" />
          Menu Management
        </h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <p className="text-yellow-800">
            No domains found. Please create a domain first before managing menus.
          </p>
          <Button
            as="a"
            href="/admin/domains"
            variant="primary"
            className="mt-4"
          >
            Go to Domains
          </Button>
        </div>
      </div>
    );
  }

  const selectedDomain = domains.find(d => d.id === selectedDomainId);
  const otherDomains = domains.filter(d => d.id !== selectedDomainId);

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6 flex items-center">
        <Menu className="mr-3 h-8 w-8" />
        Menu Management
      </h1>

      {/* Domain Selector */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-gray-500" />
            <label htmlFor="domain-select" className="text-lg font-medium">
              Select Domain
            </label>
          </div>
          {otherDomains.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => setDuplicateModalOpen(true)}
              size="sm"
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicate Menu
            </Button>
          )}
        </div>

        <select
          id="domain-select"
          value={selectedDomainId || ''}
          onChange={(e) => setSelectedDomainId(Number(e.target.value))}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          {domains.map(domain => (
            <option key={domain.id} value={domain.id}>
              {domain.hostname}
              {domain.is_default && ' (Default)'}
              {!domain.is_active && ' (Inactive)'}
            </option>
          ))}
        </select>

        {selectedDomain && (
          <div className="mt-3 text-sm text-gray-600">
            Managing menu for: <span className="font-medium">{selectedDomain.hostname}</span>
          </div>
        )}
      </div>

      {/* Menu Builder */}
      {selectedDomainId && (
        <div className="bg-white shadow rounded-lg p-6">
          <MenuBuilder domainId={selectedDomainId} />
        </div>
      )}

      {/* Duplicate Menu Modal */}
      {duplicateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Duplicate Menu</h3>
            <p className="text-sm text-gray-600 mb-4">
              Copy the menu structure from {selectedDomain?.hostname} to another domain.
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target Domain
            </label>
            <select
              value={duplicateTargetDomain || ''}
              onChange={(e) => setDuplicateTargetDomain(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4"
            >
              <option value="">Select a domain</option>
              {otherDomains.map(domain => (
                <option key={domain.id} value={domain.id}>
                  {domain.hostname}
                  {!domain.is_active && ' (Inactive)'}
                </option>
              ))}
            </select>

            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
              <p className="text-sm text-yellow-800">
                <strong>Warning:</strong> This will replace any existing menu items in the target domain.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={handleDuplicateMenu}
                disabled={!duplicateTargetDomain}
              >
                Duplicate Menu
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setDuplicateModalOpen(false);
                  setDuplicateTargetDomain(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenusPage;