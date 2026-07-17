import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Productos from '../src/pages/Productos.jsx';

function makeApi() {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ reply: 'Precio recomendado: $45.990. ¿Confirmás?' }),
  };
}

describe('Productos', () => {
  it('manda el pedido estructurado al chat y muestra la recomendación', async () => {
    const api = makeApi();
    render(<Productos api={api} />);
    await userEvent.type(screen.getByLabelText(/Nombre/), 'Calza Lumen');
    await userEvent.type(screen.getByLabelText(/Costo/), '18000');
    await userEvent.type(screen.getByLabelText(/Talles/), 'S, M, L');
    await userEvent.type(screen.getByLabelText(/Info/), 'calza tiro alto');
    await userEvent.click(screen.getByRole('button', { name: /Pedir recomendación/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [path, body] = api.post.mock.calls[0];
    expect(path).toBe('/chat');
    expect(body.message).toContain('Calza Lumen');
    expect(body.message).toContain('18000');
    expect(body.message).toContain('S, M, L');
    expect(body.message).toContain('oculto');
    expect(await screen.findByText(/Precio recomendado/)).toBeInTheDocument();
  });

  it('después de la recomendación se puede seguir la conversación (confirmar)', async () => {
    const api = makeApi();
    render(<Productos api={api} />);
    await userEvent.type(screen.getByLabelText(/Nombre/), 'X');
    await userEvent.type(screen.getByLabelText(/Costo/), '1');
    await userEvent.type(screen.getByLabelText(/Talles/), 'S');
    await userEvent.click(screen.getByRole('button', { name: /Pedir recomendación/ }));
    await screen.findByText(/Precio recomendado/);
    api.post.mockResolvedValue({ reply: 'Listo, creado oculto con id 77.' });
    await userEvent.type(screen.getByPlaceholderText(/dale|Respondé/i), 'dale, crealo');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(await screen.findByText(/creado oculto/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
  });
});
