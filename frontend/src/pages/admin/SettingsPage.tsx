import { useState, useEffect } from 'react';
import { 
  Save, 
  Settings as SettingsIcon,
  Globe,
  Mail,
  Shield
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { settingsService } from '../../services/settings';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('general');

  const tabs = [
    { id: 'general', name: 'General', icon: SettingsIcon },
    { id: 'site', name: 'Site Info', icon: Globe },
    { id: 'email', name: 'Email', icon: Mail },
    { id: 'security', name: 'Security', icon: Shield },
  ];

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const data = await settingsService.getSettings();
      setSettings(data || {});
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast.error('Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      await settingsService.updateSettings(settings);
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Posts per page
        </label>
        <Input
          type="number"
          value={settings.posts_per_page || ''}
          onChange={(e) => updateSetting('posts_per_page', e.target.value)}
          placeholder="10"
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="allow_registration"
          checked={settings.allow_registration === 'true'}
          onChange={(e) => updateSetting('allow_registration', e.target.checked ? 'true' : 'false')}
          className="rounded border-gray-300"
        />
        <label htmlFor="allow_registration" className="ml-2 text-sm text-gray-700">
          Allow user registration
        </label>
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="require_email_verification"
          checked={settings.require_email_verification === 'true'}
          onChange={(e) => updateSetting('require_email_verification', e.target.checked ? 'true' : 'false')}
          className="rounded border-gray-300"
        />
        <label htmlFor="require_email_verification" className="ml-2 text-sm text-gray-700">
          Require email verification
        </label>
      </div>
    </div>
  );

  const renderSiteSettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Site Name
        </label>
        <Input
          type="text"
          value={settings.site_name || settings.site_title || ''}
          onChange={(e) => {
            const v = e.target.value;
            // Keep both keys in sync for compatibility
            setSettings(prev => ({ ...prev, site_name: v, site_title: v }));
          }}
          placeholder="My CMS Site"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Site Description
        </label>
        <Textarea
          value={settings.site_description || ''}
          onChange={(e) => updateSetting('site_description', e.target.value)}
          placeholder="A modern content management system"
          rows={3}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Site URL
        </label>
        <Input
          type="url"
          value={settings.site_url || ''}
          onChange={(e) => updateSetting('site_url', e.target.value)}
          placeholder="https://example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Admin Email
        </label>
        <Input
          type="email"
          value={settings.admin_email || ''}
          onChange={(e) => updateSetting('admin_email', e.target.value)}
          placeholder="admin@example.com"
        />
      </div>
    </div>
  );

  const renderEmailSettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          SMTP Host
        </label>
        <Input
          type="text"
          value={settings.smtp_host || ''}
          onChange={(e) => updateSetting('smtp_host', e.target.value)}
          placeholder="smtp.gmail.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          SMTP Port
        </label>
        <Input
          type="number"
          value={settings.smtp_port || ''}
          onChange={(e) => updateSetting('smtp_port', e.target.value)}
          placeholder="587"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          SMTP Username
        </label>
        <Input
          type="text"
          value={settings.smtp_username || ''}
          onChange={(e) => updateSetting('smtp_username', e.target.value)}
          placeholder="username@gmail.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          SMTP Password
        </label>
        <Input
          type="password"
          value={settings.smtp_password || ''}
          onChange={(e) => updateSetting('smtp_password', e.target.value)}
          placeholder="••••••••"
        />
      </div>
    </div>
  );

  const renderSecuritySettings = () => (
    <div className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-yellow-800">Security Notice</h3>
        <p className="text-sm text-yellow-700 mt-1">
          Security settings should be configured carefully. Changes here can affect site security.
        </p>
      </div>
      
      <div className="text-center py-8">
        <Shield className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Security Settings</h3>
        <p className="mt-1 text-sm text-gray-500">
          Advanced security options will be available in future updates.
        </p>
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralSettings();
      case 'site':
        return renderSiteSettings();
      case 'email':
        return renderEmailSettings();
      case 'security':
        return renderSecuritySettings();
      default:
        return renderGeneralSettings();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600">Configure your site settings and preferences</p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center"
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center">
                    <Icon className="mr-2 h-4 w-4" />
                    {tab.name}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
} 