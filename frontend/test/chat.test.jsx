import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Chat from '../src/pages/Chat.jsx';

function makeApi() {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ reply: 'Te lo explico: bajó por fatiga.' }),
  };
}

describe('Chat', () => {
  it('manda el mensaje y muestra la respuesta del agente', async () => {
    const api = makeApi();
    render(<Chat api={api} />);
    const input = await screen.findByPlaceholderText(/Escribí tu pregunta/);
    await userEvent.type(input, '¿por qué bajó el ROAS?');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/chat', { message: '¿por qué bajó el ROAS?' }));
    expect(await screen.findByText(/bajó por fatiga/)).toBeInTheDocument();
  });

  it('muestra el error si el backend falla, sin romper', async () => {
    const api = makeApi();
    api.post.mockRejectedValue(new Error('falló la API de Claude'));
    render(<Chat api={api} />);
    const input = await screen.findByPlaceholderText(/Escribí tu pregunta/);
    await userEvent.type(input, 'hola{enter}');
    expect(await screen.findByText(/falló la API de Claude/)).toBeInTheDocument();
  });
});
