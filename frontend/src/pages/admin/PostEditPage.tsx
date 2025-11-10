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
import {
  useDistributionMetrics,
  usePublishingSchedules,
  usePublishingTargets,
} from '../../hooks/useMetrics';
import { postsService } from '../../services/posts';
import { categoriesService } from '../../services/categories';
import distributionService from '../../services/distribution';
import { formatDate, formatRelativeTime } from '../../lib/utils';
import { Category, UpdatePostData, Post } from '../../types';

export default function PostEditPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const postId = Number(id);

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<UpdatePostData>({});
  const [tagsInput, setTagsInput] = useState('');
  const [selectedTargets, setSelectedTargets] = useState<number[]>([]);
  const [scheduledFor, setScheduledFor] = useState('');
  const [requestAiAssets, setRequestAiAssets] = useState(true);
  const [customMessage, setCustomMessage] = useState('');
  const [isDispatching, setIsDispatching] = useState(false);

  const {
    data: targetData,
    isLoading: isLoadingTargets,
  } = usePublishingTargets();
  const targets = targetData ?? [];

  const {
    data: scheduleData,
    refetch: refetchSchedules,
    isFetching: isFetchingSchedules,
  } = usePublishingSchedules(Number.isNaN(postId) ? undefined : postId);
  const schedules = scheduleData ?? [];

  const { data: distributionMetrics } = useDistributionMetrics(Number.isNaN(postId) ? undefined : postId);

  useEffect(() => {
    if (targets.length && selectedTargets.length === 0) {
      const activeTargets = targets.filter((target) => target.is_active).map((target) => target.id);
      if (activeTargets.length) {
        setSelectedTargets(activeTargets);
      }
    }
  }, [targets, selectedTargets.length]);

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

  const toggleTarget = (targetId: number) => {
    setSelectedTargets((prev) =>
      prev.includes(targetId) ? prev.filter((id) => id !== targetId) : [...prev, targetId]
    );
  };

  const handleScheduleDistribution = async () => {
    if (!postId || Number.isNaN(postId)) {
      toast.error('Save the post before scheduling distribution');
      return;
    }

    if (!selectedTargets.length) {
      toast.error('Select at least one publishing target');
      return;
    }

    if (!scheduledFor) {
      toast.error('Choose a schedule date and time');
      return;
    }

    const scheduleDate = new Date(scheduledFor);
    if (Number.isNaN(scheduleDate.getTime())) {
      toast.error('Provide a valid schedule date');
      return;
    }

    setIsDispatching(true);
    try {
      await Promise.all(
        selectedTargets.map((targetId) =>
          distributionService.createSchedule({
            postId,
            targetId,
            scheduledFor: scheduleDate.toISOString(),
            options: {
              requestAiAssets,
              customMessage: customMessage || undefined,
            },
          })
        )
      );
      toast.success('Distribution scheduled');
      setScheduledFor('');
      refetchSchedules();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to schedule distribution';
      toast.error(message);
    } finally {
      setIsDispatching(false);
    }
  };

  const handleImmediateDispatch = async () => {
    if (!postId || Number.isNaN(postId)) {
      toast.error('Save the post before dispatching distribution');
      return;
    }

    if (!selectedTargets.length) {
      toast.error('Select at least one publishing target');
      return;
    }

    setIsDispatching(true);
    try {
      await distributionService.dispatch({
        postId,
        targetIds: selectedTargets,
        requestAiAssets,
        customMessage: customMessage || undefined,
      });
      toast.success('Distribution dispatched');
      refetchSchedules();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to dispatch distribution';
      toast.error(message);
    } finally {
      setIsDispatching(false);
    }
  };

  const handleSendSchedule = async (scheduleId: number) => {
    setIsDispatching(true);
    try {
      await distributionService.dispatchSchedule(scheduleId);
      toast.success('Schedule dispatched');
      refetchSchedules();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to dispatch schedule';
      toast.error(message);
    } finally {
      setIsDispatching(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: number) => {
    setIsDispatching(true);
    try {
      await distributionService.deleteSchedule(scheduleId);
      toast.success('Schedule removed');
      refetchSchedules();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to remove schedule';
      toast.error(message);
    } finally {
      setIsDispatching(false);
    }
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

            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Distribution</h3>
                <p className="text-xs text-gray-500">Coordinate cross-channel publishing and monitoring.</p>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Targets</p>
                  {isLoadingTargets ? (
                    <div className="py-2 flex justify-center"><LoadingSpinner size="sm" /></div>
                  ) : targets.length === 0 ? (
                    <p className="text-xs text-gray-500">No publishing targets configured yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {targets.map((target) => (
                        <label key={target.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                            checked={selectedTargets.includes(target.id)}
                            onChange={() => toggleTarget(target.id)}
                            disabled={!target.is_active || isDispatching}
                          />
                          <span className={target.is_active ? 'text-gray-700' : 'text-gray-400 line-through'}>
                            {target.name}
                            <span className="ml-1 text-xs uppercase text-gray-400">({target.channel})</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <Input
                  type="datetime-local"
                  label="Schedule for"
                  name="distribution_scheduled_for"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  helperText="Leave blank to send immediately"
                />

                <div className="flex items-center gap-2">
                  <input
                    id="request_ai_assets"
                    type="checkbox"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    checked={requestAiAssets}
                    onChange={(e) => setRequestAiAssets(e.target.checked)}
                  />
                  <label htmlFor="request_ai_assets" className="text-sm text-gray-700">
                    Request AI excerpts & hashtags
                  </label>
                </div>

                <Textarea
                  label="Custom message"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  rows={2}
                  placeholder="Optional intro or call to action"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  onClick={handleImmediateDispatch}
                  disabled={isDispatching || !selectedTargets.length || !postId || Number.isNaN(postId)}
                  loading={isDispatching}
                >
                  Send now
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleScheduleDistribution}
                  disabled={isDispatching || !selectedTargets.length || !scheduledFor}
                  loading={isDispatching}
                >
                  Schedule distribution
                </Button>
              </div>

              {distributionMetrics && (
                <div className="space-y-3">
                  {distributionMetrics.channelPerformance.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Channel performance</p>
                      <div className="space-y-2 mt-1">
                        {distributionMetrics.channelPerformance.map((metric) => (
                          <div key={metric.channel} className="flex items-center justify-between text-xs text-gray-600">
                            <span className="font-medium text-gray-700 capitalize">{metric.channel}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-green-600">Sent {metric.sent}</span>
                              <span className="text-yellow-600">Queued {metric.queued}</span>
                              {metric.retrying > 0 && <span className="text-blue-600">Retry {metric.retrying}</span>}
                              {metric.failed > 0 && <span className="text-red-600">Failed {metric.failed}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Upcoming deliveries</p>
                    {isFetchingSchedules ? (
                      <div className="py-2 flex justify-center"><LoadingSpinner size="sm" /></div>
                    ) : schedules.length === 0 ? (
                      <p className="text-xs text-gray-500">No upcoming deliveries for this post.</p>
                    ) : (
                      <div className="space-y-3 mt-1">
                        {schedules.slice(0, 4).map((schedule) => {
                          const statusColor = schedule.status === 'sent'
                            ? 'bg-green-100 text-green-800'
                            : schedule.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : schedule.status === 'retrying'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-yellow-100 text-yellow-800';
                          return (
                            <div key={schedule.id} className="border border-gray-200 rounded-md p-3 bg-white shadow-sm">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-gray-800">{schedule.target_name}</p>
                                  <p className="text-xs text-gray-500">
                                    {formatDate(schedule.scheduled_for, 'MMM d, yyyy h:mm a')} · {formatRelativeTime(schedule.scheduled_for)}
                                  </p>
                                </div>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>
                                  {schedule.status}
                                </span>
                              </div>
                              {schedule.last_error && (
                                <p className="text-xs text-red-600 mt-2">{schedule.last_error}</p>
                              )}
                              <div className="flex items-center gap-2 mt-3">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleSendSchedule(schedule.id)}
                                  disabled={isDispatching}
                                >
                                  Send now
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDeleteSchedule(schedule.id)}
                                  disabled={isDispatching}
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" disabled={isSaving} className="w-full">
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}


