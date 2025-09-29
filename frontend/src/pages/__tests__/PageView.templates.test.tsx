import { describe, it, vi, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import PageView from '../PageView';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/services/pages', () => ({
  pagesService: {
    getPageBySlug: vi.fn().mockImplementation(async (slug: string) => {
      if (slug === 'about') return { title: 'About', slug: 'about', content: '<p>About content</p>', template: 'about', updated_at: new Date().toISOString(), seo_indexed: true, published: true };
      if (slug === 'data') return { title: 'Data', slug: 'data', content: '<p>Content</p>', template: 'default', data: { blocks: [{ type: 'richText', props: { html: '<p>X</p>' } }] }, updated_at: new Date().toISOString(), seo_indexed: true, published: true };
      return null as any;
    })
  }
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('PageView templates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders about template content', async () => {
    render(
      <MemoryRouter initialEntries={["/page/about"]}>
        <Routes>
          <Route path="/page/:slug" element={<Wrapper><PageView/></Wrapper>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByRole('heading', { name: /about/i })).toBeInTheDocument();
    expect(screen.getByText(/about content/i)).toBeInTheDocument();
  });

  it('renders default template content with data available', async () => {
    render(
      <MemoryRouter initialEntries={["/page/data"]}>
        <Routes>
          <Route path="/page/:slug" element={<Wrapper><PageView/></Wrapper>} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByRole('heading', { name: 'Data' })).toBeInTheDocument();
    expect(screen.getByText(/content/i)).toBeInTheDocument();
  });
});
