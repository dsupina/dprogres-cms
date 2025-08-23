import { describe, it, vi, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import PublicHeader from '../PublicHeader';

vi.mock('@/services/settings', () => ({
  settingsService: { getSettings: vi.fn().mockResolvedValue({ site_title: 'My Site' }) }
}));

vi.mock('@/services/pages', () => ({
  pagesService: {
    getPublicPages: vi.fn().mockResolvedValue({ data: [
      { id: 1, title: 'About', slug: 'about' },
      { id: 2, title: 'Contact', slug: 'contact' },
    ] })
  }
}));

describe('PublicHeader', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders published pages in navigation', async () => {
    render(
      <MemoryRouter>
        <PublicHeader />
      </MemoryRouter>
    );

    expect(await screen.findByText('About')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
  });
});
