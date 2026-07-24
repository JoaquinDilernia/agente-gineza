import { describe, it, expect, vi } from 'vitest';
import { shouldRunSaleAnalysis } from '../src/agent/rateLimit.js';
import { createAgentRunner } from '../src/agent/runner.js';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createAgentStateStore } from '../src/store/agentState.js';
import { createConfigStore } from '../src/config/configStore.js';

describe('shouldRunSaleAnalysis', () => {
  const now = new Date('2026-07-14T12:00:00Z').getTime();
  it('sin corrida previa → true', () =>
    expect(shouldRunSaleAnalysis({ lastSaleRunAt: null }, now, 30)).toBe(true));
  it('corrida hace 10 min con mínimo 30 → false', () =>
    expect(shouldRunSaleAnalysis({ lastSaleRunAt: '2026-07-14T11:50:00Z' }, now, 30)).toBe(false));
  it('corrida hace 31 min con mínimo 30 → true', () =>
    expect(shouldRunSaleAnalysis({ lastSaleRunAt: '2026-07-14T11:29:00Z' }, now, 30)).toBe(true));
});

function makeRunner(anthropicResponses) {
  const db = createFakeFirestore();
  const agentState = createAgentStateStore(db);
  const configStore = createConfigStore(db);
  const create = vi.fn();
  anthropicResponses.forEach((r) => create.mockResolvedValueOnce(r));
  // el runner usa stream().finalMessage() — el mock delega en `create` para inspección
  const anthropic = { messages: { stream: (params) => ({ finalMessage: () => create(params) }) } };
  const contextBuilder = { build: vi.fn().mockResolvedValue('CONTEXT') };
  const dispatch = vi.fn().mockResolvedValue({ ok: true });
  const runner = createAgentRunner({ anthropic, contextBuilder, dispatch, agentState, configStore });
  return { runner, create, dispatch, agentState, configStore };
}

describe('runner', () => {
  it('loop: ejecuta tools hasta que Claude termina', async () => {
    const { runner, dispatch, create } = makeRunner([
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'pause_ad', input: { ad_id: '1' } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'listo' }] },
    ]);
    await runner.runDeep();
    expect(dispatch).toHaveBeenCalledWith('pause_ad', { ad_id: '1' });
    expect(create).toHaveBeenCalledTimes(2);
    // el segundo call incluye el tool_result (el runner muta messages, buscamos el mensaje puntual)
    const secondMessages = create.mock.calls[1][0].messages;
    const toolResultMsg = secondMessages.find(
      (m) => m.role === 'user' && Array.isArray(m.content) && m.content[0]?.type === 'tool_result',
    );
    expect(toolResultMsg.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1' });
  });
  it('agentEnabled=false: runDeep no llama a Claude', async () => {
    const { runner, create, configStore } = makeRunner([]);
    await configStore.update({ agentEnabled: false });
    const result = await runner.runDeep();
    expect(create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ skipped: true });
  });
  it('onSale respeta el rate limit: encola sin correr', async () => {
    const { runner, create, agentState } = makeRunner([]);
    await agentState.set({ lastSaleRunAt: new Date().toISOString() });
    await runner.onSale({ orderId: '55' });
    expect(create).not.toHaveBeenCalled();
    expect((await agentState.get()).pendingOrderIds).toContain('55');
  });
  it('agentEnabled=false: onSale encola sin correr ni perder el pedido', async () => {
    const { runner, create, agentState, configStore } = makeRunner([]);
    await configStore.update({ agentEnabled: false });
    await agentState.set({ pendingOrderIds: [], lastSaleRunAt: '2026-01-01T00:00:00Z' });
    await runner.onSale({ orderId: '55' });
    expect(create).not.toHaveBeenCalled();
    expect((await agentState.get()).pendingOrderIds).toContain('55');
  });
  it('onSale corre con las órdenes acumuladas cuando pasó la ventana', async () => {
    const { runner, create, agentState } = makeRunner([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] },
    ]);
    await agentState.set({ pendingOrderIds: ['44'], lastSaleRunAt: '2026-01-01T00:00:00Z' });
    await runner.onSale({ orderId: '55' });
    expect(create).toHaveBeenCalledTimes(1);
    expect((await agentState.get()).pendingOrderIds).toEqual([]);
  });
});
