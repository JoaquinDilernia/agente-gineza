import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentRunner } from '../src/agent/runner.js';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createAgentStateStore } from '../src/store/agentState.js';
import { createConfigStore } from '../src/config/configStore.js';
import { createChatMessagesStore } from '../src/store/chatMessages.js';

function makeRunner(anthropicResponses) {
  const db = createFakeFirestore();
  const agentState = createAgentStateStore(db);
  const configStore = createConfigStore(db);
  const chatMessages = createChatMessagesStore(db);
  const create = vi.fn();
  anthropicResponses.forEach((r) => create.mockResolvedValueOnce(r));
  const anthropic = { messages: { stream: (params) => ({ finalMessage: () => create(params) }) } };
  const contextBuilder = { build: vi.fn().mockResolvedValue('CONTEXTO_CUENTA') };
  const dispatch = vi.fn().mockResolvedValue({ ok: true });
  const chatDispatch = vi.fn().mockResolvedValue({ ok: true, paused: '123' });
  const runner = createAgentRunner({
    anthropic, contextBuilder, dispatch, agentState, configStore, chatMessages, chatDispatch,
  });
  return { runner, create, dispatch, chatDispatch, chatMessages };
}

describe('runner.chat', () => {
  it('responde texto simple y guarda ambos mensajes en el historial', async () => {
    const { runner, chatMessages } = makeRunner([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'El ROAS bajó porque...' }] },
    ]);
    const r = await runner.chat('¿por qué bajó el ROAS esta semana?');
    expect(r.reply).toBe('El ROAS bajó porque...');
    const history = await chatMessages.listRecent();
    expect(history.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(history[0].content).toBe('¿por qué bajó el ROAS esta semana?');
  });

  it('usa chatDispatch (no dispatch normal) para las tool calls', async () => {
    const { runner, chatDispatch, dispatch } = makeRunner([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'pause_ad', input: { ad_id: '123' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Listo, lo pausé.' }] },
    ]);
    const r = await runner.chat('pausá el anuncio 123');
    expect(chatDispatch).toHaveBeenCalledWith('pause_ad', { ad_id: '123' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(r.reply).toBe('Listo, lo pausé.');
  });

  it('incluye el historial previo como turnos user/assistant reales', async () => {
    const { runner, create, chatMessages } = makeRunner([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'primera' }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'segunda' }] },
    ]);
    await runner.chat('hola');
    await runner.chat('y ahora?');
    const secondCallMessages = create.mock.calls[1][0].messages;
    const roles = secondCallMessages.map((m) => m.role);
    // debe incluir el contexto, el turno viejo (hola/primera) y el nuevo (y ahora?)
    expect(roles.filter((r) => r === 'user')).toEqual(expect.arrayContaining(['user']));
    expect(JSON.stringify(secondCallMessages)).toContain('hola');
    expect(JSON.stringify(secondCallMessages)).toContain('primera');
    expect(JSON.stringify(secondCallMessages)).toContain('y ahora?');
  });
});
