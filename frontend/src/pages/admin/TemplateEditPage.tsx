import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { templatesService, type UpdateTemplateData, type Template } from '@/services/templates';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { toast } from 'react-hot-toast';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function TemplateEditPage() {
  const nav = useNavigate(); const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<UpdateTemplateData>({});
  const [schemaText, setSchemaText] = useState('{}');
  const [defaultText, setDefaultText] = useState('{}');

  useEffect(() => {
    (async () => {
      try {
        const r = await templatesService.get(Number(id));
        const t = r.data as unknown as Template;
        setForm({ key: t.key, name: t.name, description: t.description, enabled: t.enabled });
        setSchemaText(JSON.stringify(t.schema || {}, null, 2));
        setDefaultText(JSON.stringify(t.default_data || {}, null, 2));
      } catch { toast.error('Failed to load template'); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const onChange = (e: any) => setForm(prev => ({ ...prev, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const onSubmit = async (e: any) => {
    e.preventDefault();
    try {
      const schema = schemaText.trim() ? JSON.parse(schemaText) : {};
      const def = defaultText.trim() ? JSON.parse(defaultText) : {};
      await templatesService.update(Number(id), { ...form, schema, default_data: def });
      toast.success('Template updated'); nav('/admin/templates');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Update failed');
    }
  };

  if (loading) return <div className="min-h-[40vh] flex items-center justify-center"><LoadingSpinner/></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Edit Template</h1>
        <Button as={Link} to="/admin/templates" variant="secondary">Cancel</Button>
      </div>

      <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg border space-y-6">
        <Input label="Key" name="key" value={form.key || ''} onChange={onChange} required />
        <Input label="Name" name="name" value={form.name || ''} onChange={onChange} required />
        <Textarea label="Description" name="description" value={form.description || ''} onChange={onChange} rows={2} />
        <div className="flex items-center gap-2">
          <input id="enabled" name="enabled" type="checkbox" checked={form.enabled !== false} onChange={onChange} className="h-4 w-4 border-gray-300 rounded"/>
          <label htmlFor="enabled" className="text-sm text-gray-700">Enabled</label>
        </div>
        <Textarea label="Schema (JSON)" value={schemaText} onChange={e => setSchemaText(e.target.value)} rows={6} />
        <Textarea label="Default Data (JSON)" value={defaultText} onChange={e => setDefaultText(e.target.value)} rows={6} />
        <Button type="submit">Save Changes</Button>
      </form>
    </div>
  );
}
