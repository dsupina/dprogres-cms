import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Building2, Upload, Save } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { organizationService, Organization } from '../../services/organization';

interface OrganizationDetailsFormProps {
  organization: Organization;
  canEdit: boolean;
}

export default function OrganizationDetailsForm({ organization, canEdit }: OrganizationDetailsFormProps) {
  const [name, setName] = useState(organization.name);
  const [logoPreview, setLogoPreview] = useState<string | null>(organization.logo_url || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Sync local state when organization prop changes
  useEffect(() => {
    setName(organization.name);
    setLogoPreview(organization.logo_url || null);
  }, [organization.name, organization.logo_url]);

  // Update organization mutation
  const updateMutation = useMutation({
    mutationFn: (data: { name?: string }) =>
      organizationService.updateOrganization(organization.id, data),
    onSuccess: () => {
      toast.success('Organization updated successfully');
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update organization');
    },
  });

  // Upload logo mutation
  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => organizationService.uploadLogo(organization.id, file),
    onSuccess: (data) => {
      setLogoPreview(data.logoUrl);
      toast.success('Logo uploaded successfully');
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to upload logo');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() === organization.name) {
      toast.success('No changes to save');
      return;
    }
    updateMutation.mutate({ name: name.trim() });
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be smaller than 2MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (event) => {
      setLogoPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload the file
    uploadLogoMutation.mutate(file);
  };

  const handleLogoClick = () => {
    if (canEdit) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-2 mb-6">
        <Building2 className="h-5 w-5 text-gray-500" />
        <h2 className="text-lg font-semibold text-gray-900">Organization Details</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Logo Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
          <div className="flex items-center gap-6">
            <div
              onClick={handleLogoClick}
              className={`relative w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden ${
                canEdit ? 'cursor-pointer hover:border-primary-500 hover:bg-gray-50' : ''
              }`}
            >
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt="Organization logo"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Building2 className="h-10 w-10 text-gray-400" />
              )}
              {canEdit && uploadLogoMutation.isPending && (
                <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                </div>
              )}
            </div>
            {canEdit && (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleLogoClick}
                  disabled={uploadLogoMutation.isPending}
                  icon={<Upload className="h-4 w-4" />}
                >
                  Upload Logo
                </Button>
                <p className="text-xs text-gray-500 mt-1">JPEG, PNG, GIF, WebP or SVG. Max 2MB.</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
              onChange={handleLogoChange}
              className="hidden"
            />
          </div>
        </div>

        {/* Name Section */}
        <Input
          label="Organization Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canEdit}
          required
          placeholder="Enter organization name"
        />

        {/* Read-only info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <label className="block text-gray-500">Slug</label>
            <p className="font-medium text-gray-900">{organization.slug}</p>
          </div>
          <div>
            <label className="block text-gray-500">Plan</label>
            <p className="font-medium text-gray-900 capitalize">{organization.plan_tier}</p>
          </div>
        </div>

        {/* Save Button */}
        {canEdit && (
          <div className="flex justify-end pt-4 border-t">
            <Button
              type="submit"
              loading={updateMutation.isPending}
              disabled={name.trim() === organization.name}
              icon={<Save className="h-4 w-4" />}
            >
              Save Changes
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
