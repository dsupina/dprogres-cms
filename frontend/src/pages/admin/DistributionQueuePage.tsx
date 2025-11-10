import { useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle, RefreshCcw, Send, MessageCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Textarea from '../../components/ui/Textarea';
import { formatRelativeTime } from '../../lib/utils';
import { useDistributionMetrics, useDistributionQueue } from '../../hooks/useMetrics';
import distributionService from '../../services/distribution';

export default function DistributionQueuePage() {
  const { data: queue, isLoading, refetch, isFetching } = useDistributionQueue();
  const { data: metrics } = useDistributionMetrics();
  const [feedbackNotes, setFeedbackNotes] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState<Record<number, boolean>>({});

  const alertCount = metrics?.alerts?.length ?? 0;
  const retryingCount = queue?.filter((item) => item.status === 'retrying').length ?? 0;

  const queueItems = useMemo(() => queue ?? [], [queue]);

  const handleFeedbackSubmit = async (logId: number) => {
    const notes = feedbackNotes[logId];
    if (!notes || notes.trim().length < 3) {
      toast.error('Add actionable feedback before submitting.');
      return;
    }

    setSubmitting((prev) => ({ ...prev, [logId]: true }));
    try {
      await distributionService.sendFeedback(logId, {
        notes,
        submittedAt: new Date().toISOString(),
      });
      toast.success('Feedback captured for retraining');
      setFeedbackNotes((prev) => ({ ...prev, [logId]: '' }));
      refetch();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to submit feedback';
      toast.error(message);
    } finally {
      setSubmitting((prev) => ({ ...prev, [logId]: false }));
    }
  };

  const handleRetry = async (logId: number) => {
    setSubmitting((prev) => ({ ...prev, [logId]: true }));
    try {
      await distributionService.retryLog(logId, { dispatch: true });
      toast.success('Retry dispatched');
      refetch();
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Failed to retry distribution';
      toast.error(message);
    } finally {
      setSubmitting((prev) => ({ ...prev, [logId]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Distribution Queue</h1>
          <p className="text-gray-600">Monitor delivery health, capture feedback, and trigger retries.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-red-100 text-red-700 font-medium">
            <AlertTriangle className="h-4 w-4 mr-2" />
            {alertCount} alerts
          </span>
          <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
            <RefreshCcw className="h-4 w-4 mr-2" />
            {retryingCount} retrying
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : queueItems.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg p-10 text-center">
          <h2 className="text-lg font-medium text-gray-900">Queue is clear</h2>
          <p className="text-sm text-gray-500 mt-2">All distribution targets are healthy. New deliveries will appear here when queued.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {queueItems.map((item) => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{item.post_title}</p>
                  <p className="text-xs text-gray-500">{item.target_name} · {formatRelativeTime(item.updated_at)}</p>
                  {item.error && <p className="text-xs text-red-600 mt-2">{item.error}</p>}
                </div>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                    item.status === 'failed'
                      ? 'bg-red-100 text-red-700'
                      : item.status === 'retrying'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {item.status}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Textarea
                    label="Feedback for AI retraining"
                    placeholder="Describe what went wrong or what messaging to improve"
                    value={feedbackNotes[item.id] ?? ''}
                    onChange={(e) => setFeedbackNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    rows={3}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<MessageCircle className="h-4 w-4" />}
                    onClick={() => handleFeedbackSubmit(item.id)}
                    disabled={submitting[item.id]}
                    loading={submitting[item.id]}
                  >
                    Submit feedback
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="border border-gray-200 rounded-md p-3 bg-gray-50 text-sm text-gray-600">
                    <p className="font-medium text-gray-800">Retry strategy</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Automatic retries increment the backoff window. Use the button below to immediately requeue the delivery.
                    </p>
                  </div>
                  <Button
                    type="button"
                    icon={<Send className="h-4 w-4" />}
                    onClick={() => handleRetry(item.id)}
                    disabled={submitting[item.id]}
                    loading={submitting[item.id]}
                  >
                    Retry now
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isFetching && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <LoadingSpinner size="sm" />
          Refreshing queue…
        </div>
      )}
    </div>
  );
}
