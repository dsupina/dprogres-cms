import { describe, it, vi, expect, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PageNewPage from '../PageNewPage';

vi.mock('@/services/templates', () => ({
  templatesService: {
    list: vi.fn().mockResolvedValue({ data: [
      { id: 1, key: 'about', name: 'About', enabled: true, default_data: { blocks: [{ type: 'richText', props: { html: '<p>hi</p>' } }] } },
    ] }),
  }
}));

vi.mock('@/services/pages', () => ({
  pagesService: {
    createPage: vi.fn().mockResolvedValue({ data: { id: 10 } }),
  }
}));

describe('PageNewPage template select prefill', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prefills data JSON from selected template default_data', async () => {
    render(
      <MemoryRouter>
        <PageNewPage />
      </MemoryRouter>
    );

    // wait for template options to be present
    const select = await screen.findByLabelText(/template/i);
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(1));
    await userEvent.selectOptions(select, 'about');

    // data textarea should appear with default_data stringified
    const dataArea = await screen.findByLabelText(/data \(json\)/i);
    expect(dataArea).toHaveDisplayValue(/blocks/);
  });
});
