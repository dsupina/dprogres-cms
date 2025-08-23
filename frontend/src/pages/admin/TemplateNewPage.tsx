import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { templatesService, type CreateTemplateData } from '@/services/templates';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { toast } from 'react-hot-toast';

export default function TemplateNewPage() {
  const nav = useNavigate();
  const [form, setForm] = useState<CreateTemplateData>({ key: '', name: '', description: '', enabled: true, schema: {}, default_data: {} });
  const [schemaText, setSchemaText] = useState('{}');
  const [defaultText, setDefaultText] = useState('{}');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const onChange = (e: any) => setForm(prev => ({ ...prev, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const onSubmit = async (e: any) => {
    e.preventDefault();
    try {
      const schema = schemaText.trim() ? JSON.parse(schemaText) : {};
      const def = defaultText.trim() ? JSON.parse(defaultText) : {};
      await templatesService.create({ ...form, schema, default_data: def });
      toast.success('Template created'); nav('/admin/templates');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Create failed';
      setErrors({ form: msg }); toast.error(msg);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">New Template</h1>
        <Button as={Link} to="/admin/templates" variant="secondary">Cancel</Button>
      </div>

      <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg border space-y-6">
        <Input label="Key" name="key" value={form.key} onChange={onChange} placeholder="about, contact, landing" required />
        <Input label="Name" name="name" value={form.name} onChange={onChange} required />
        <Textarea label="Description" name="description" value={form.description || ''} onChange={onChange} rows={2} />
        <div className="flex items-center gap-2">
          <input id="enabled" name="enabled" type="checkbox" checked={!!form.enabled} onChange={onChange} className="h-4 w-4 border-gray-300 rounded"/>
          <label htmlFor="enabled" className="text-sm text-gray-700">Enabled</label>
        </div>
        <Textarea label="Schema (JSON)" name="schema" value={schemaText} onChange={e => setSchemaText(e.target.value)} rows={6} />
        <Textarea label="Default Data (JSON)" name="default_data" value={defaultText} onChange={e => setDefaultText(e.target.value)} rows={6} />
        {errors.form && <p className="text-sm text-red-600">{errors.form}</p>}
        <Button type="submit">Create Template</Button>
      </form>
    </div>
  );
}
