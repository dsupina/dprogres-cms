import { describe, it, vi, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TemplatesPage from '../TemplatesPage';
import TemplateNewPage from '../TemplateNewPage';
import TemplateEditPage from '../TemplateEditPage';

vi.mock('@/services/templates', () => {
  return {
    templatesService: {
      list: vi.fn().mockResolvedValue({ data: [
        { id: 1, key: 'about', name: 'About', enabled: true, description: '', schema: {}, default_data: {}, created_at: '', updated_at: '' },
        { id: 2, key: 'contact', name: 'Contact', enabled: false, description: '', schema: {}, default_data: {}, created_at: '', updated_at: '' },
      ] }),
      remove: vi.fn().mockResolvedValue({ message: 'ok' }),
      create: vi.fn().mockResolvedValue({ data: { id: 3, key: 'landing', name: 'Landing' } }),
      get: vi.fn().mockResolvedValue({ data: { id: 1, key: 'about', name: 'About', enabled: true, description: 'd', schema: {}, default_data: { blocks: [] }, created_at: '', updated_at: '' } }),
      update: vi.fn().mockResolvedValue({ data: { id: 1, key: 'about', name: 'About 2' } }),
    }
  };
});

describe('Admin TemplatesPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists templates and navigates to new template', async () => {
    render(
      <MemoryRouter initialEntries={["/admin/templates"]}>
        <Routes>
          <Route path="/admin/templates" element={<TemplatesPage/>} />
          <Route path="/admin/templates/new" element={<TemplateNewPage/>} />
        </Routes>
      </MemoryRouter>
    );
    const heading = await screen.findByRole('heading', { name: /templates/i });
    expect(heading).toBeInTheDocument();

    const table = screen.getByRole('table');
    expect(within(table).getByText('About')).toBeInTheDocument();
    expect(within(table).getByText('Contact')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: /new template/i }));
    expect(await screen.findByRole('heading', { name: /new template/i })).toBeInTheDocument();
  });

  it('creates a template from new page', async () => {
    const { templatesService } = await import('@/services/templates');
    render(
      <MemoryRouter initialEntries={["/admin/templates/new"]}>
        <Routes>
          <Route path="/admin/templates/new" element={<TemplateNewPage/>} />
        </Routes>
      </MemoryRouter>
    );

    await userEvent.type(await screen.findByLabelText(/key/i), 'landing');
    await userEvent.type(screen.getByLabelText(/name/i), 'Landing');

    const schema = screen.getByLabelText(/schema \(json\)/i);
    fireEvent.change(schema, { target: { value: '{"blocks": []}' } });

    await userEvent.click(screen.getByRole('button', { name: /create template/i }));
    await waitFor(() => expect(templatesService.create).toHaveBeenCalled());
  });

  it('loads an existing template and saves changes', async () => {
    const { templatesService } = await import('@/services/templates');
    render(
      <MemoryRouter initialEntries={["/admin/templates/1/edit"]}>
        <Routes>
          <Route path="/admin/templates/:id/edit" element={<TemplateEditPage/>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /edit template/i })).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'About 2');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(templatesService.update).toHaveBeenCalled());
  });
});
