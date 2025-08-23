import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { templatesService, type Template } from '@/services/templates';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { toast } from 'react-hot-toast';

export default function TemplatesPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setLoading(true);
      const r = await templatesService.list();
      setItems((r.data as any) || []);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onDelete = async (id: number) => {
    if (!confirm('Delete template?')) return;
    try { await templatesService.remove(id); toast.success('Deleted'); load(); }
    catch { toast.error('Delete failed'); }
  };

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><LoadingSpinner/></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Templates</h1>
          <p className="text-gray-600">Manage page templates</p>
        </div>
        <Button as={Link} to="/admin/templates/new">New Template</Button>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enabled</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {items.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">{t.name}</td>
                <td className="px-6 py-4 text-gray-600">{t.key}</td>
                <td className="px-6 py-4">{t.enabled ? 'Yes' : 'No'}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex gap-2 justify-end">
                    <Button as={Link} variant="secondary" size="sm" to={`/admin/templates/${t.id}/edit`}>Edit</Button>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => onDelete(t.id)}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td className="px-6 py-8 text-center text-gray-500" colSpan={4}>No templates</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
