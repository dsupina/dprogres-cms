import React, { useEffect, useState } from 'react';
import { useQuery } from 'react-query';
import { domainsService } from '../../services/domains';
import Select from '../ui/Select';

interface DomainSelectorProps {
  value?: number | null;
  onChange: (domainId: number | null) => void;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}

const DomainSelector: React.FC<DomainSelectorProps> = ({
  value,
  onChange,
  required = false,
  error,
  disabled = false
}) => {
  const [selectedDomain, setSelectedDomain] = useState<string>(value?.toString() || '');

  const { data: domains, isLoading } = useQuery(
    'domains',
    () => domainsService.getAll(),
    {
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
      cacheTime: 10 * 60 * 1000
    }
  );

  useEffect(() => {
    setSelectedDomain(value?.toString() || '');
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setSelectedDomain(newValue);
    onChange(newValue ? parseInt(newValue, 10) : null);
  };

  // Find the selected domain for URL preview
  const currentDomain = domains?.find(d => d.id === parseInt(selectedDomain, 10));

  // Convert domains to options format
  const options = domains?.map(domain => ({
    value: domain.id,
    label: `${domain.hostname}${domain.is_default ? ' (Default)' : ''}${!domain.is_active ? ' (Inactive)' : ''}`
  })) || [];

  return (
    <div className="space-y-1">
      <Select
        label="Domain"
        value={selectedDomain}
        onChange={handleChange}
        required={required}
        error={error}
        disabled={disabled || isLoading}
        options={options}
        placeholder="Select a domain"
      />

      {currentDomain && (
        <p className="text-sm text-gray-500">
          URL Preview: https://{currentDomain.hostname}/[slug]
        </p>
      )}
    </div>
  );
};

export default DomainSelector;