import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import PostsPage from '../PostsPage';

vi.mock('@/services/posts', () => ({
  postsService: {
    getAllPosts: vi.fn().mockResolvedValue({ posts: [], pagination: { totalPages: 1 } }),
    deletePost: vi.fn(),
    bulkDeletePosts: vi.fn(),
  },
}));

vi.mock('@/services/categories', () => ({
  categoriesService: {
    getAllCategories: vi.fn().mockResolvedValue({ categories: [] }),
  },
}));

describe('Admin PostsPage - New Post button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows New Post button linking to /admin/posts/new', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/admin/posts' }] as any}>
        <PostsPage />
      </MemoryRouter>
    );

    // Wait for initial render
    const buttons = await screen.findAllByRole('link', { name: /new post/i });
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons[0]).toHaveAttribute('href', '/admin/posts/new');
  });
});


