import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import RichTextEditor from '../../components/ui/RichTextEditor';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Select from '../../components/ui/Select';
import { pagesService } from '../../services/pages';
import { CreatePageData } from '../../types';
import { templatesService, type Template } from '../../services/templates';

export default function PageNewPage() {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [dataText, setDataText] = useState<string>('');

  const [formData, setFormData] = useState<CreatePageData>({
    title: '',
    slug: '',
    content: '',
    template: '',
    meta_title: '',
    meta_description: '',
    seo_indexed: true,
    published: false,
    data: undefined,
  });

  useEffect(() => {
    (async () => {
      try {
        const resp = await templatesService.list();
        const list = ((resp.data as any) || []).filter((t: Template) => t.enabled !== false);
        setTemplates(list);
      } catch {
        // ignore
      }
    })();
  }, []);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!formData.title || formData.title.trim().length === 0) {
      next.title = 'Title is required';
    }
    if (formData.slug && /\s/.test(formData.slug)) {
      next.slug = 'Slug cannot contain spaces';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type, checked } = e.target as any;
    if (type === 'checkbox') {
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else if (name === 'template') {
      setFormData((prev) => ({ ...prev, template: value }));
      const selected = templates.find(t => t.key === value);
      if (selected && (formData.data == null)) {
        setFormData((prev) => ({ ...prev, data: selected.default_data }));
        setDataText(JSON.stringify(selected.default_data || {}, null, 2));
      }
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    try {
      // Parse data JSON if provided in text area
      let dataObj: any = formData.data;
      if (dataText && dataText.trim()) {
        try {
          dataObj = JSON.parse(dataText);
        } catch {
          toast.error('Invalid JSON in Data');
          setIsLoading(false);
          return;
        }
      }

      const sanitized = Object.entries({ ...formData, data: dataObj }).reduce((acc, [k, v]) => {
        // @ts-expect-error index
        acc[k] = typeof v === 'string' && v.trim() === '' ? undefined : v;
        return acc;
      }, {} as CreatePageData);

      const payload: CreatePageData = {
        ...sanitized,
        slug: sanitized.slug || undefined,
      };
      const res = await pagesService.createPage(payload);
      if (res?.data) {
        toast.success('Page created');
      } else {
        toast.success('Page created');
      }
      navigate('/admin/pages');
    } catch (err: any) {
      const apiError = err?.response?.data;
      if (apiError?.details && Array.isArray(apiError.details)) {
        const fieldErrors: Record<string, string> = {};
        const fields: string[] = [];
        for (const d of apiError.details) {
          if (d.field) {
            fieldErrors[d.field] = d.message;
            fields.push(d.field);
          }
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
        toast.error('Failed to create page');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Page</h1>
          <p className="text-gray-600">Create and publish a new static page</p>
        </div>
        <Button as={Link} to="/admin/pages" variant="secondary">
          Cancel
        </Button>
      </div>

      <form className="bg-white p-6 rounded-lg shadow-sm border space-y-6" onSubmit={onSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Input
              label="Title"
              name="title"
              value={formData.title}
              onChange={onChange}
              error={errors.title}
              placeholder="Enter page title"
              required
            />

            <Input
              label="Slug"
              name="slug"
              value={formData.slug}
              onChange={onChange}
              error={errors.slug}
              placeholder="auto-generated from title if left empty"
            />

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Content</label>
              <RichTextEditor
                value={formData.content || ''}
                onChange={(html) => setFormData((prev) => ({ ...prev, content: html }))}
                placeholder="Write your page content here"
              />
            </div>

            {(formData.data !== undefined) && (
              <Textarea
                label="Data (JSON)"
                name="data"
                value={dataText}
                onChange={(e) => setDataText(e.target.value)}
                rows={6}
              />
            )}
          </div>

          <div className="space-y-6">
            <Select
              label="Template"
              name="template"
              value={formData.template || ''}
              onChange={onChange}
              placeholder="Default"
              options={templates.map(t => ({ value: t.key, label: t.name }))}
            />

            <Input
              label="Meta Title"
              name="meta_title"
              value={formData.meta_title || ''}
              onChange={onChange}
              error={errors.meta_title}
              placeholder="Optional SEO title"
            />

            <Textarea
              label="Meta Description"
              name="meta_description"
              value={formData.meta_description || ''}
              onChange={onChange}
              error={errors.meta_description}
              placeholder="Optional SEO description"
              rows={3}
            />

            <div className="flex items-center gap-2">
              <input
                id="seo_indexed"
                name="seo_indexed"
                type="checkbox"
                checked={formData.seo_indexed !== false}
                onChange={onChange}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="seo_indexed" className="text-sm text-gray-700">
                Allow indexing
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="published"
                name="published"
                type="checkbox"
                checked={!!formData.published}
                onChange={onChange}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="published" className="text-sm text-gray-700">
                Published
              </label>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Creating...
                </>
              ) : (
                'Create Page'
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}


