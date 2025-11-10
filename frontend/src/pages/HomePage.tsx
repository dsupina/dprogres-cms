import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, User, Clock } from 'lucide-react';
import { postsService } from '../services/posts';
import { formatDate, generateReadingTime, truncateText, getImageUrl, getFirstImageFromHtml } from '../lib/utils';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Button from '../components/ui/Button';
import { settingsService } from '@/services/settings';
import { useEffect, useState } from 'react';
import { featureFlags } from '@/lib/config';
import BlockRenderer from '@/components/content/BlockRenderer';
import type { BlockNode } from '@/types/content';

export default function HomePage() {
  const [heroTitle, setHeroTitle] = useState('Welcome to My Blog');
  const [heroSubtitle, setHeroSubtitle] = useState('Discover insights, tutorials, and stories about web development, technology, and personal growth.');

  useEffect(() => {
    const load = async () => {
      try {
        const s = await settingsService.getSettings();
        const name = s?.site_title || s?.site_name;
        if (name) setHeroTitle(name);
        if (s?.site_description) setHeroSubtitle(s.site_description);
      } catch (_) {
        // ignore
      }
    };
    load();
  }, []);
  const {
    data: featuredPosts,
    isLoading: featuredLoading,
    isError: featuredError
  } = useQuery({
    queryKey: ['posts', 'featured'],
    queryFn: () => postsService.getFeaturedPosts(6),
    staleTime: 1000 * 60 * 5
  });

  const {
    data: recentPosts,
    isLoading: recentLoading,
    isError: recentError
  } = useQuery({
    queryKey: ['posts', 'recent'],
    queryFn: () => postsService.getRecentPosts(6),
    staleTime: 1000 * 60 * 5
  });
  const heroBlocks = featureFlags.enableBlockRenderer && !featuredLoading
    ? (featuredPosts?.posts?.[0]?.blocks as BlockNode[] | undefined)
    : undefined;
  const shouldRenderHeroBlocks = Array.isArray(heroBlocks) && heroBlocks.length > 0;

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className={shouldRenderHeroBlocks ? 'bg-gray-50' : 'bg-gradient-to-r from-primary-600 to-primary-800 text-white'}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          {shouldRenderHeroBlocks ? (
            <div className="mx-auto max-w-4xl">
              <BlockRenderer blocks={heroBlocks} />
            </div>
          ) : (
            <div className="text-center">
              <h1 className="text-4xl md:text-6xl font-bold mb-6">{heroTitle}</h1>
              <p className="text-xl md:text-2xl mb-8 text-primary-100 max-w-3xl mx-auto">{heroSubtitle}</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  as={Link}
                  to="/blog"
                  size="lg"
                  className="bg-white text-primary-600 hover:bg-gray-100"
                >
                  Explore Blog
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  as={Link}
                  to="/page/about"
                  variant="ghost"
                  size="lg"
                  className="text-white border-white hover:bg-white hover:text-primary-600"
                >
                  About Me
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
                About Me
              </Button>
            </div>
          </div>
          </div>
        </section>

        {/* Featured Posts */}
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Featured Posts
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Handpicked articles and tutorials that showcase the best content
            </p>
          </div>
            {featuredError ? (
              <div className="text-center text-red-500">
                Unable to load featured posts right now. Please try again later.
              </div>
            ) : featuredLoading ? (
            <div className="flex justify-center">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {featuredPosts?.posts?.map((post) => (
                <article key={post.id} className="card group hover:shadow-lg transition-shadow">
                  {(post.featured_image || getFirstImageFromHtml(post.content)) && (
                    <div className="aspect-video bg-gray-200 rounded-t-lg overflow-hidden">
                      <img
                        src={getImageUrl(post.featured_image || getFirstImageFromHtml(post.content) || '')}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          const target = e.currentTarget as HTMLImageElement;
                          // Hide broken image area gracefully
                          target.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <div className="card-body">
                    <div className="flex items-center text-sm text-gray-500 mb-2">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDate(post.created_at, 'MMM d, yyyy')}
                      <span className="mx-2">•</span>
                      <Clock className="h-4 w-4 mr-1" />
                      {generateReadingTime(post.content || '')} min read
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-primary-600 transition-colors">
                      <Link to={`/blog/${post.slug}`}>
                        {post.title}
                      </Link>
                    </h3>
                    {post.excerpt && (
                      <p className="text-gray-600 mb-4">
                        {truncateText(post.excerpt, 120)}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center text-sm text-gray-500">
                        <User className="h-4 w-4 mr-1" />
                        {post.first_name} {post.last_name}
                      </div>
                      <Link
                        to={`/blog/${post.slug}`}
                        className="text-primary-600 hover:text-primary-700 font-medium text-sm"
                      >
                        Read More
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

        {/* Recent Posts */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Latest Posts
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Stay up to date with the latest articles and insights
            </p>
          </div>

            {recentError ? (
              <div className="text-center text-red-500">
                Unable to load recent posts right now. Please try again later.
              </div>
            ) : recentLoading ? (
            <div className="flex justify-center">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {recentPosts?.posts?.map((post) => (
                <article key={post.id} className="card group hover:shadow-lg transition-shadow">
                  {(post.featured_image || getFirstImageFromHtml(post.content)) && (
                    <div className="aspect-video bg-gray-200 rounded-t-lg overflow-hidden">
                      <img
                        src={getImageUrl(post.featured_image || getFirstImageFromHtml(post.content) || '')}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  )}
                  <div className="card-body">
                    <div className="flex items-center text-sm text-gray-500 mb-2">
                      <Calendar className="h-4 w-4 mr-1" />
                      {formatDate(post.created_at, 'MMM d, yyyy')}
                      {post.category_name && (
                        <>
                          <span className="mx-2">•</span>
                          <Link
                            to={`/category/${post.category_slug}`}
                            className="hover:text-primary-600 transition-colors"
                          >
                            {post.category_name}
                          </Link>
                        </>
                      )}
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-primary-600 transition-colors">
                      <Link to={`/blog/${post.slug}`}>
                        {post.title}
                      </Link>
                    </h3>
                    {post.excerpt && (
                      <p className="text-gray-600 mb-4">
                        {truncateText(post.excerpt, 120)}
                      </p>
                    )}
                    <Link
                      to={`/blog/${post.slug}`}
                      className="text-primary-600 hover:text-primary-700 font-medium text-sm inline-flex items-center"
                    >
                      Read More
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="text-center mt-12">
            <Button as={Link} to="/blog" size="lg">
              View All Posts
            </Button>
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="py-16 bg-primary-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Stay Updated
          </h2>
          <p className="text-xl text-primary-100 mb-8 max-w-2xl mx-auto">
            Subscribe to get the latest posts and updates delivered directly to your inbox
          </p>
          <div className="max-w-md mx-auto">
            <form className="flex flex-col sm:flex-row gap-4">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-3 rounded-lg border-0 focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-primary-600"
              />
              <Button type="submit" className="bg-white text-primary-600 hover:bg-gray-100">
                Subscribe
              </Button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
} 