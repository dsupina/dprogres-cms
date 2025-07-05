import { useQuery } from 'react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, User } from 'lucide-react';
import { pagesService } from '@/services/pages';
import { formatDate } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Button from '@/components/ui/Button';
import { useEffect } from 'react';

export default function PageView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const { data: page, isLoading, error } = useQuery(
    ['page', slug],
    () => pagesService.getPageBySlug(slug!),
    { enabled: !!slug }
  );

  // Update page title and meta tags
  useEffect(() => {
    if (page) {
      document.title = `${page.title} | My Site`;
      
      // Update meta description
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', page.excerpt || page.title);
      }
    }
  }, [page]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Page Not Found</h1>
          <p className="text-gray-600 mb-6">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Button onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </div>

      {/* Page Content */}
      <article className="py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
              {page.title}
            </h1>
            
            {page.excerpt && (
              <p className="text-xl text-gray-600 leading-relaxed mb-6">
                {page.excerpt}
              </p>
            )}

            {/* Meta Information */}
            <div className="flex items-center text-sm text-gray-500 border-t border-b border-gray-200 py-4">
              <div className="flex items-center">
                <Calendar className="h-4 w-4 mr-1" />
                Last updated: {formatDate(page.updated_at, 'MMMM d, yyyy')}
              </div>
              {page.first_name && page.last_name && (
                <>
                  <span className="mx-4">•</span>
                  <div className="flex items-center">
                    <User className="h-4 w-4 mr-1" />
                    {page.first_name} {page.last_name}
                  </div>
                </>
              )}
            </div>
          </header>

          {/* Featured Image */}
          {page.featured_image && (
            <div className="mb-8">
              <img
                src={page.featured_image}
                alt={page.title}
                className="w-full h-auto rounded-lg shadow-lg"
              />
            </div>
          )}

          {/* Content */}
          <div className="prose prose-lg max-w-none">
            <div 
              dangerouslySetInnerHTML={{ __html: page.content || '' }}
              className="prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-primary-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-900 prose-code:text-primary-600 prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-blockquote:border-l-4 prose-blockquote:border-primary-500 prose-blockquote:text-gray-700 prose-img:rounded-lg prose-img:shadow-md"
            />
          </div>
        </div>
      </article>

      {/* Contact CTA for specific pages */}
      {(page.slug === 'about' || page.slug === 'contact') && (
        <section className="py-12 bg-white border-t">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Get in Touch
            </h2>
            <p className="text-gray-600 mb-6">
              Have a question or want to work together? I'd love to hear from you.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                as="a" 
                href="mailto:hello@example.com"
                className="bg-primary-600 hover:bg-primary-700 text-white"
              >
                Send Email
              </Button>
              <Button 
                as="a" 
                href="https://linkedin.com/in/yourprofile"
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
              >
                Connect on LinkedIn
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
} 