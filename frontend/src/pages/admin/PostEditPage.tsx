import { useEffect, useState, useCallback } from 'react';
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
import { postsService } from '../../services/posts';
import { categoriesService } from '../../services/categories';
import { Category, UpdatePostData, Post } from '../../types';
import AiAssistantPanel from '../../components/admin/AiAssistantPanel';

export default function PostEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<UpdatePostData>({});
  const [tagsInput, setTagsInput] = useState('');
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [siteId, setSiteId] = useState<number>(1);

  const numericContentId = Number(id) || 0;

  // Auto-save hook
  const {
    status: autoSaveStatus,
    lastSaved,
    hasUnsavedChanges,
    manualSave
  } = useAutoSave({
    contentType: 'post',
    contentId: Number(id) || 0,
    content: {
      ...formData,
      tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean)
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
        const [catRes, postRes] = await Promise.all([
          categoriesService.getAllCategories(),
          postsService.getPostById(Number(id))
        ]);
        setCategories((catRes.data as any) || []);
        const post = (postRes.data as unknown as Post);
        setFormData({
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          content: post.content,
          featured_image: post.featured_image,
          status: post.status,
          category_id: post.category_id,
          meta_title: post.meta_title,
          meta_description: post.meta_description,
          seo_indexed: post.seo_indexed,
          scheduled_at: post.scheduled_at,
          featured: post.featured,
        });
        setSiteId(post.site_id || 1);
        setTagsInput((post.tags || []).map(t => t.name).join(', '));
      } catch (e: any) {
        toast.error(e?.response?.data?.error || 'Failed to load post');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [id]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target as any;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : name === 'category_id' ? (value ? Number(value) : undefined) : value,
    }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Sanitize: convert empty strings to undefined to satisfy backend Joi
      const sanitized: UpdatePostData = Object.entries(formData).reduce((acc, [k, v]) => {
        // @ts-expect-error index access
        acc[k] = (typeof v === 'string' && v.trim() === '') ? undefined : v;
        return acc;
      }, {} as UpdatePostData);

      // Normalize scheduled_at for Joi: only include when status === 'scheduled' and value is a valid date
      const normalized = { ...sanitized } as any;
      if (normalized.scheduled_at) {
        const isValid = !Number.isNaN(Date.parse(normalized.scheduled_at as any));
        if (!isValid || normalized.status !== 'scheduled') {
          delete normalized.scheduled_at;
        }
      }

      const payload: UpdatePostData = {
        ...normalized,
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      };
      await postsService.updatePost(Number(id), payload);
      toast.success('Post updated');
      navigate('/admin/posts');
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
        if (/status/i.test(msg)) next.status = msg;
        if (/category/i.test(msg)) next.category_id = msg;
        setErrors(next);
        toast.error(msg);
      } else {
        toast.error('Failed to update post');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAiInsert = useCallback((suggestion: string, mode: 'append' | 'replace' = 'append') => {
    setFormData(prev => {
      const existing = prev.content || '';
      const nextContent = mode === 'replace'
        ? suggestion
        : [existing, suggestion].filter(Boolean).join(existing ? '\n\n' : '');
      return {
        ...prev,
        content: nextContent,
      };
    });
  }, []);

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
            <h1 className="text-2xl font-bold text-gray-900">Edit Post</h1>
            <p className="text-gray-600">Update and republish your blog post</p>
          </div>
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsAssistantOpen(true)}
            disabled={numericContentId <= 0}
          >
            Open AI Assistant
          </Button>
          <SaveStatusIndicator
            status={autoSaveStatus}
            lastSaved={lastSaved}
            hasUnsavedChanges={hasUnsavedChanges}
            onManualSave={manualSave}
          />
          <Button as={Link} to="/admin/posts" variant="secondary">Cancel</Button>
        </div>
      </div>

      <form onSubmit={onSubmit} className="bg-white p-6 rounded-lg shadow-sm border space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Input label="Title" name="title" value={formData.title || ''} onChange={onChange} error={errors.title} required />
            <Input label="Slug" name="slug" value={formData.slug || ''} onChange={onChange} error={errors.slug} />
            <Textarea label="Excerpt" name="excerpt" value={formData.excerpt || ''} onChange={onChange} error={errors.excerpt} rows={3} />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Content</label>
              <RichTextEditor value={formData.content || ''} onChange={(html) => setFormData(prev => ({ ...prev, content: html }))} />
            </div>
          </div>
          <div className="space-y-6">
            <Select label="Status" name="status" value={formData.status || 'draft'} onChange={onChange} options={[{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'scheduled', label: 'Scheduled' }]} />
            <Select label="Category" name="category_id" value={formData.category_id || ''} onChange={onChange} placeholder="Select a category" options={categories.map(c => ({ value: c.id, label: c.name }))} />
            {/* Featured image URL removed; use content editor image upload */}
            <Input label="Meta Title" name="meta_title" value={formData.meta_title || ''} onChange={onChange} error={errors.meta_title} placeholder="Optional SEO title" />
            <Textarea label="Meta Description" name="meta_description" value={formData.meta_description || ''} onChange={onChange} error={errors.meta_description} rows={3} />
            <Input label="Tags (comma separated)" name="tags" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
            <div className="flex items-center gap-2">
              <input id="featured" name="featured" type="checkbox" checked={!!formData.featured} onChange={onChange} className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
              <label htmlFor="featured" className="text-sm text-gray-700">Featured</label>
            </div>
            <div className="flex items-center gap-2">
              <input id="seo_indexed" name="seo_indexed" type="checkbox" checked={formData.seo_indexed !== false} onChange={onChange} className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded" />
              <label htmlFor="seo_indexed" className="text-sm text-gray-700">Allow indexing</label>
            </div>
            <Button type="submit" disabled={isSaving} className="w-full">{isSaving ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        </div>
      </form>
      <AiAssistantPanel
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        onInsert={handleAiInsert}
        siteId={siteId}
        contentId={numericContentId}
        contentType="post"
        currentTitle={formData.title}
        currentExcerpt={formData.excerpt}
        currentContent={formData.content}
      />
    </div>
  );
}


