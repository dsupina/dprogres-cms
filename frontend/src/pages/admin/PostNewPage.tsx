import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import RichTextEditor from '../../components/ui/RichTextEditor';
import Select from '../../components/ui/Select';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { postsService } from '../../services/posts';
import { categoriesService } from '../../services/categories';
import { Category, CreatePostData } from '../../types';

export default function PostNewPage() {
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<CreatePostData>({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    status: 'draft',
    category_id: undefined,
    meta_title: '',
    meta_description: '',
    seo_indexed: true,
    scheduled_at: undefined,
    featured: false,
    tags: [],
  });

  const [tagsInput, setTagsInput] = useState('');

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setIsLoadingCategories(true);
        const res = await categoriesService.getAllCategories();
        setCategories((res.data as any) || []);
      } catch (e) {
        // no-op
      } finally {
        setIsLoadingCategories(false);
      }
    };
    loadCategories();
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

  const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target as any;
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (name === 'category_id') {
      setFormData(prev => ({ ...prev, category_id: value ? Number(value) : undefined }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    try {
      const sanitized = Object.entries(formData).reduce((acc, [k, v]) => {
        // @ts-expect-error index
        acc[k] = (typeof v === 'string' && v.trim() === '') ? undefined : v;
        return acc;
      }, {} as CreatePostData);

      const withoutImage = ((o: any) => {
        const rest = { ...(o ?? {}) } as any;
        delete rest.featured_image;
        return rest;
      })(sanitized as any);

      // Remove or normalize scheduled_at if not scheduling or invalid
      if ((withoutImage as any).scheduled_at) {
        const scheduled = (withoutImage as any).scheduled_at as any;
        const isValid = !Number.isNaN(Date.parse(scheduled));
        if (!isValid || (withoutImage as any).status !== 'scheduled') {
          delete (withoutImage as any).scheduled_at;
        }
      }

      const payload: CreatePostData = {
        ...withoutImage,
        slug: sanitized.slug || undefined,
        tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      };
      const res = await postsService.createPost(payload);
      if (res?.data) {
        toast.success('Post created');
        navigate('/admin/posts');
      } else {
        toast.success('Post created');
        navigate('/admin/posts');
      }
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
        toast.error('Failed to create post');
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingCategories) {
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
          <h1 className="text-2xl font-bold text-gray-900">New Post</h1>
          <p className="text-gray-600">Create and publish a new blog post</p>
        </div>
        <Button as={Link} to="/admin/posts" variant="secondary">
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
              placeholder="Enter post title"
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

            <Textarea
              label="Excerpt"
              name="excerpt"
              value={formData.excerpt}
              onChange={onChange}
              error={errors.excerpt}
              placeholder="Short summary for listings and SEO"
              rows={3}
            />

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Content</label>
              <RichTextEditor
                value={formData.content || ''}
                onChange={(html) => setFormData(prev => ({ ...prev, content: html }))}
                placeholder="Write your post content here"
              />
            </div>
          </div>

          <div className="space-y-6">
            <Select
              label="Status"
              name="status"
              value={formData.status}
              onChange={onChange}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'published', label: 'Published' },
                { value: 'scheduled', label: 'Scheduled' },
              ]}
            />

            <Select
              label="Category"
              name="category_id"
              value={formData.category_id || ''}
              onChange={onChange}
              placeholder="Select a category"
              options={categories.map(c => ({ value: c.id, label: c.name }))}
            />

            {/* Featured image URL removed. Use editor image upload instead. */}

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

            <Input
              label="Tags (comma separated)"
              name="tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="news, release, tutorial"
            />

            <div className="flex items-center gap-2">
              <input
                id="featured"
                name="featured"
                type="checkbox"
                checked={!!formData.featured}
                onChange={onChange}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="featured" className="text-sm text-gray-700">Featured</label>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="seo_indexed"
                name="seo_indexed"
                type="checkbox"
                checked={formData.seo_indexed !== false}
                onChange={onChange}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <label htmlFor="seo_indexed" className="text-sm text-gray-700">Allow indexing</label>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" className="mr-2" />
                  Creating...
                </>
              ) : (
                'Create Post'
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}


