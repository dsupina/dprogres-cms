import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import Select from '../../components/ui/Select';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import RichTextEditor from '../../components/ui/RichTextEditor';
import { SaveStatusIndicator } from '../../components/ui/SaveStatusIndicator';
import { useAutoSave } from '../../hooks/useAutoSave';
import { pagesService } from '../../services/pages';
import { templatesService, type Template } from '../../services/templates';
import { UpdatePageData, Page } from '../../types';

export default function PageEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [dataText, setDataText] = useState<string>('');

  const [formData, setFormData] = useState<UpdatePageData>({});

  // Auto-save hook
  const {
    status: autoSaveStatus,
    lastSaved,
    hasUnsavedChanges,
    manualSave
  } = useAutoSave({
    contentType: 'page',
    contentId: Number(id) || 0,
    content: {
      ...formData,
      data: dataText && dataText.trim() ? (() => {
        try { return JSON.parse(dataText); } catch { return formData.data; }
      })() : formData.data
    },
    enabled: !!id && !isLoading && !isSaving,
    onSaveSuccess: () => {
      console.log('Auto-save successful');
    },
    onSaveError: (error) => {
      console.error('Auto-save failed:', error);
    }
  });

  // Keyboard shortcut for manual save (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges) {
          manualSave();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, manualSave]);

  useEffect(() => {
    const load = async () => {
      try {
        const [tplRes, pageRes] = await Promise.all([
          templatesService.list(),
          pagesService.getPageById(Number(id))
        ]);
        setTemplates(((tplRes.data as any) || []).filter((t: Template) => t.enabled !== false));
        const page = (pageRes.data as unknown as Page);
        setFormData({
          title: page.title,
          slug: page.slug,
          content: page.content,
          template: page.template,
          meta_title: page.meta_title,
          meta_description: page.meta_description,
          seo_indexed: page.seo_indexed,
          published: page.published,
          data: page.data,
        });
        setDataText(JSON.stringify(page.data || {}, null, 2));
      } catch (e: any) {
        toast.error(e?.response?.data?.error || 'Failed to load page');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = (e.target as any);
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let dataObj: any = formData.data;
      if (dataText && dataText.trim()) {
        try { dataObj = JSON.parse(dataText); } catch { toast.error('Invalid JSON in Data'); setIsSaving(false); return; }
      }
      const sanitized: UpdatePageData = Object.entries({ ...formData, data: dataObj }).reduce((acc, [k, v]) => {
        // @ts-expect-error index access
        acc[k] = (typeof v === 'string' && v.trim() === '') ? undefined : v;
        return acc;
      }, {} as UpdatePageData);

      await pagesService.updatePage(Number(id), sanitized);
      toast.success('Page updated');
      navigate('/admin/pages');
    } catch (err: any) {
      const apiError = err?.response?.data;
      if (apiError?.details && Array.isArray(apiError.details)) {
        const fieldErrors: Record<string, string> = {};
        const fields: string[] = [];
        for (const d of apiError.details) {
          if (d.field) { fieldErrors[d.field] = d.message; fields.push(d.field); }
        }
        setErrors(fieldErrors);
        toast.error(`Fix these fields: ${fields.join(', ')}`);
      } else if (typeof apiError?.error === 'string') {
        const msg: string = apiError.error;
        const next: Record<string, string> = { ...errors };
        if (/slug/i.test(msg)) next.slug = msg;
        if (/title/i.test(msg)) next.title = msg;
        setErrors(next);
        toast.error(msg);
      } else {
        toast.error('Failed to update page');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Edit Page</h1>
          <p className="text-gray-600">Update and republish your static page</p>
        </div>
        <div className="flex items-center gap-4">
          <SaveStatusIndicator
            status={autoSaveStatus}
            lastSaved={lastSaved}
            hasUnsavedChanges={hasUnsavedChanges}
            onManualSave={manualSave}
          />
          <Button as={Link} to="/admin/pages" variant="secondary">Cancel</Button>
        </div>
      </div>

      <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg shadow-sm border space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Input label="Title" name="title" value={formData.title || ''} onChange={onChange} error={errors.title} required />
            <Input label="Slug" name="slug" value={formData.slug || ''} onChange={onChange} error={errors.slug} />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Content</label>
              <RichTextEditor value={formData.content || ''} onChange={(html) => setFormData(prev => ({ ...prev, content: html }))} />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Data (JSON)</label>
              <Textarea name="data" value={dataText} onChange={(e) => setDataText(e.target.value)} rows={6} />
            </div>
          </div>
          <div className="space-y-6">
            <Select label="Template" name="template" value={formData.template || ''} onChange={onChange} placeholder="Default" options={templates.map(t => ({ value: t.key, label: t.name }))} />
            <Input label="Meta Title" name="meta_title" value={formData.meta_title || ''} onChange={onChange} error={errors.meta_title} placeholder="Optional SEO title" />
            <Textarea label="Meta Description" name="meta_description" value={formData.meta_description || ''} onChange={onChange} error={errors.meta_description} rows={3} />
            <div className="flex items-center gap-2">
              <input id="seo_indexed" name="seo_indexed" type="checkbox" checked={formData.seo_indexed !== false} onChange={onChange} className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
              <label htmlFor="seo_indexed" className="text-sm text-gray-700">Allow indexing</label>
            </div>
            <div className="flex items-center gap-2">
              <input id="published" name="published" type="checkbox" checked={!!formData.published} onChange={onChange} className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
              <label htmlFor="published" className="text-sm text-gray-700">Published</label>
            </div>
            <Button type="submit" disabled={isSaving} className="w-full">{isSaving ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}


