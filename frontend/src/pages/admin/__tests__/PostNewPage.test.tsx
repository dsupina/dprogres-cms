import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostNewPage from '../PostNewPage';
import { postsService } from '@/services/posts';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/services/categories', () => ({
  categoriesService: {
    getAllCategories: vi.fn().mockResolvedValue({ categories: [{ id: 1, name: 'Tech', slug: 'tech', seo_indexed: true, created_at: new Date().toISOString() }] }),
  },
}));

vi.mock('@/services/posts', () => ({
  postsService: {
    createPost: vi.fn().mockResolvedValue({ data: { id: 1, title: 'Hello', slug: 'hello' } }),
  },
}));

describe('Admin PostNewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits minimal valid form and navigates back to posts list', async () => {
    render(
      <MemoryRouter>
        <PostNewPage />
      </MemoryRouter>
    );

    // After categories load, fill required fields
    const title = await screen.findByPlaceholderText(/enter post title/i);
    await userEvent.type(title, 'My First Post');

    const submit = screen.getByRole('button', { name: /create post/i });
    await userEvent.click(submit);

    await waitFor(() => expect(postsService.createPost).toHaveBeenCalled());
    expect(postsService.createPost).toHaveBeenCalledWith(expect.objectContaining({ title: 'My First Post' }));
    expect(mockNavigate).toHaveBeenCalledWith('/admin/posts');
  });
});


