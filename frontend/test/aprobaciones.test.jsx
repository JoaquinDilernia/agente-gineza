import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Aprobaciones from '../src/pages/Aprobaciones.jsx';

const decision = {
  id: 'd1',
  tool: 'propose_budget_change',
  reason: 'ROAS real 1.48x, bajo el break-even',
  expectedImpact: 'ahorro de $3.000/día',
  input: { object_name: 'CATALOGO CALIENTE AW', current_budget: 6000, proposed_budget: 3000 },
  status: 'pending',
};

function makeApi() {
  return {
    get: vi.fn().mockResolvedValue([decision]),
    post: vi.fn().mockResolvedValue({ ok: true }),
  };
}

describe('Aprobaciones', () => {
  it('muestra la decisión pendiente con razón y números', async () => {
    render(<Aprobaciones api={makeApi()} />);
    expect(await screen.findByText(/ROAS real 1.48x/)).toBeInTheDocument();
    expect(screen.getByText(/CATALOGO CALIENTE AW/)).toBeInTheDocument();
    expect(screen.getByText(/6.000.*3.000/)).toBeInTheDocument();
  });

  it('Aprobar hace POST a /decisions/:id/approve y refresca', async () => {
    const api = makeApi();
    render(<Aprobaciones api={api} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/decisions/d1/approve'));
    // refresco: get llamado de nuevo tras la acción
    expect(api.get.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('Rechazar hace POST a reject', async () => {
    const api = makeApi();
    render(<Aprobaciones api={api} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/decisions/d1/reject'));
  });

  it('error del backend se muestra sin romper', async () => {
    const api = makeApi();
    api.post.mockRejectedValue(new Error('Meta 100: bad'));
    render(<Aprobaciones api={api} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    expect(await screen.findByText(/Meta 100/)).toBeInTheDocument();
  });
});
