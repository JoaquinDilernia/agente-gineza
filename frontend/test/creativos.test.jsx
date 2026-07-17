import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Creativos from '../src/pages/Creativos.jsx';

function makeApi() {
  return { get: vi.fn().mockResolvedValue([]), post: vi.fn(), postForm: vi.fn().mockResolvedValue({ id: 'cr1' }) };
}

describe('Creativos — tipo de pieza', () => {
  it('al elegir Video cambian los inputs de archivo', async () => {
    render(<Creativos api={makeApi()} />);
    await screen.findByText('Subir creativo');
    await userEvent.selectOptions(screen.getByLabelText(/Tipo de pieza/), 'video');
    expect(screen.getByLabelText(/Video feed/)).toHaveAttribute('accept', 'video/*');
    expect(screen.getByLabelText(/Video story/)).toHaveAttribute('accept', 'video/*');
    expect(screen.getByText(/tarda/i)).toBeInTheDocument();
  });
  it('submit de video manda feedVideo y storyVideo en el FormData', async () => {
    const api = makeApi();
    render(<Creativos api={api} />);
    await screen.findByText('Subir creativo');
    await userEvent.selectOptions(screen.getByLabelText(/Tipo de pieza/), 'video');
    await userEvent.type(screen.getByPlaceholderText(/BORDO/), 'REEL1');
    await userEvent.type(screen.getByPlaceholderText(/Tu nuevo uniforme/), 'copy');
    await userEvent.upload(screen.getByLabelText(/Video feed/), new File(['v'], 'f.mp4', { type: 'video/mp4' }));
    await userEvent.upload(screen.getByLabelText(/Video story/), new File(['v'], 's.mp4', { type: 'video/mp4' }));
    expect(screen.getByLabelText(/Video feed/).files).toHaveLength(1);
    expect(screen.getByLabelText(/Video story/).files).toHaveLength(1);
    // jsdom no refleja los files en `value`, así que `required` bloquearía el click:
    // disparamos el submit directo (en navegador real el click funciona)
    fireEvent.submit(document.querySelector('form'));
    await waitFor(() => expect(api.postForm).toHaveBeenCalled());
    const fd = api.postForm.mock.calls[0][1];
    expect(fd.get('feedVideo')).toBeInstanceOf(File);
    expect(fd.get('storyVideo')).toBeInstanceOf(File);
    expect(fd.get('feedImage')).toBeNull();
  });
});
