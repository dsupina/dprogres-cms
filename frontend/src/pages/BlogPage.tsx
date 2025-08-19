import { useState } from 'react';
import { useQuery } from 'react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Filter, Calendar, User, Clock, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { postsService } from '../services/posts';
import { categoriesService } from '../services/categories';
import { formatDate, generateReadingTime, truncateText, getImageUrl, getFirstImageFromHtml } from '../lib/utils';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

export default function BlogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'created_at');
  const [sortOrder, setSortOrder] = useState(searchParams.get('order') || 'desc');
  
  const currentPage = parseInt(searchParams.get('page') || '1');
  const limit = 12;

  // Fetch posts with filters
  const { data: postsData, isLoading: postsLoading } = useQuery(
    ['posts', currentPage, searchTerm, selectedCategory, sortBy, sortOrder],
    () => postsService.getPosts({
      page: currentPage,
      limit,
      search: searchTerm || undefined,
      category: selectedCategory || undefined,
      sort: sortBy,
      order: sortOrder as 'asc' | 'desc'
    }),
    { keepPreviousData: true }
  );

  // Fetch categories for filter dropdown
  const { data: categoriesData } = useQuery(
    'categories',
    () => categoriesService.getCategories()
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ search: searchTerm, page: '1' });
  };

  const updateFilters = (updates: Record<string, string>) => {
    const newParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        newParams.set(key, value);
      } else {
        newParams.delete(key);
      }
    });
    setSearchParams(newParams);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    updateFilters({ category: value, page: '1' });
  };

  const handleSortChange = (value: string) => {
    const [newSortBy, newSortOrder] = value.split('-');
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    updateFilters({ sort: newSortBy, order: newSortOrder, page: '1' });
  };

  const handlePageChange = (page: number) => {
    updateFilters({ page: page.toString() });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalPages = Math.ceil((postsData?.total || postsData?.pagination?.totalCount || 0) / limit);

  // Create options arrays for Select components
  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...(categoriesData?.categories?.map(category => ({
      value: category.slug,
      label: category.name
    })) || [])
  ];

  const sortOptions = [
    { value: 'created_at-desc', label: 'Latest First' },
    { value: 'created_at-asc', label: 'Oldest First' },
    { value: 'title-asc', label: 'Title A-Z' },
    { value: 'title-desc', label: 'Title Z-A' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <section className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Blog
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Explore articles, tutorials, and insights about web development, 
              technology, and more
            </p>
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            {/* Search */}
            <form onSubmit={handleSearch} className="flex-1 max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search articles..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </form>

            {/* Filters */}
            <div className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-gray-400" />
                <span className="text-sm text-gray-600">Filter by:</span>
              </div>
              
              <Select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                options={categoryOptions}
                placeholder="All Categories"
              />

              <Select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => handleSortChange(e.target.value)}
                options={sortOptions}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Results Summary */}
          <div className="mb-8">
            <p className="text-gray-600">
              {postsLoading ? (
                'Loading...'
              ) : (
                `${postsData?.total || 0} article${(postsData?.total || 0) !== 1 ? 's' : ''} found`
              )}
              {searchTerm && (
                <span> for "{searchTerm}"</span>
              )}
              {selectedCategory && (
                <span> in {categoriesData?.categories?.find(c => c.slug === selectedCategory)?.name}</span>
              )}
            </p>
          </div>

          {/* Posts Grid */}
          {postsLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : postsData?.posts?.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <Search className="h-16 w-16 mx-auto" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No articles found</h3>
              <p className="text-gray-600 mb-4">
                Try adjusting your search terms or filters
              </p>
              <Button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('');
                  setSearchParams(new URLSearchParams());
                }}
                variant="outline"
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {postsData?.posts?.map((post) => (
                <article key={post.id} className="card group hover:shadow-lg transition-shadow">
                  {(post.featured_image || getFirstImageFromHtml(post.content)) && (
                    <div className="aspect-video bg-gray-200 rounded-t-lg overflow-hidden">
                      <img
                        src={getImageUrl(post.featured_image || getFirstImageFromHtml(post.content) || '')}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center text-sm text-gray-500">
                        <User className="h-4 w-4 mr-1" />
                        {post.first_name} {post.last_name}
                        <span className="mx-2">•</span>
                        <Clock className="h-4 w-4 mr-1" />
                        {generateReadingTime(post.content || '')} min
                      </div>
                      <Link
                        to={`/blog/${post.slug}`}
                        className="text-primary-600 hover:text-primary-700 font-medium text-sm inline-flex items-center"
                      >
                        Read More
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-12 flex justify-center">
              <nav className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                  if (
                    page === 1 ||
                    page === totalPages ||
                    (page >= currentPage - 2 && page <= currentPage + 2)
                  ) {
                    return (
                      <Button
                        key={page}
                        variant={page === currentPage ? 'default' : 'outline'}
                        onClick={() => handlePageChange(page)}
                        className="min-w-[40px]"
                      >
                        {page}
                      </Button>
                    );
                  } else if (page === currentPage - 3 || page === currentPage + 3) {
                    return (
                      <span key={page} className="px-2 text-gray-500">
                        ...
                      </span>
                    );
                  }
                  return null;
                })}
                
                <Button
                  variant="outline"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </nav>
            </div>
          )}
        </div>
      </section>
    </div>
  );
} 