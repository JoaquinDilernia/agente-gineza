import { TOOL_DEFINITIONS } from './tools.js';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { shouldRunSaleAnalysis } from './rateLimit.js';

const MAX_TURNS = 15;

export function createAgentRunner({ anthropic, contextBuilder, dispatch, agentState, configStore, model = 'claude-sonnet-5' }) {
  async function run(kind, extra = {}) {
    const context = await contextBuilder.build(kind, extra);
    const messages = [{ role: 'user', content: context }];
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Sonnet 5 piensa (adaptive thinking) antes de actuar y eso consume max_tokens.
      // effort "medium" acota la profundidad del razonamiento (default "high" agotaba
      // 16K tokens solo pensando con este contexto grande). Streaming es obligatorio
      // para max_tokens grandes (el SDK rechaza non-streaming por timeout HTTP).
      const stream = anthropic.messages.stream({
        model,
        max_tokens: 32000,
        output_config: { effort: 'medium' },
        system: SYSTEM_PROMPT,
        tools: TOOL_DEFINITIONS,
        messages,
      });
      const resp = await stream.finalMessage();
      messages.push({ role: 'assistant', content: resp.content });
      if (resp.stop_reason !== 'tool_use') break;
      const results = [];
      for (const block of resp.content.filter((b) => b.type === 'tool_use')) {
        const result = await dispatch(block.name, block.input);
        results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
      }
      messages.push({ role: 'user', content: results });
    }
  }

  return {
    runDeep: () => run('deep'),
    runRetrospective: () => run('retrospective'),
    async onSale(orderSummary) {
      const config = await configStore.get();
      const state = await agentState.get();
      const pending = [...new Set([...state.pendingOrderIds, String(orderSummary.orderId)])];
      if (!shouldRunSaleAnalysis(state, Date.now(), config.minMinutesBetweenSaleRuns)) {
        await agentState.set({ pendingOrderIds: pending });
        return { queued: true };
      }
      await agentState.set({ pendingOrderIds: [], lastSaleRunAt: new Date().toISOString() });
      await run('sale', { newOrders: pending.map((id) => ({ orderId: id })), latestOrder: orderSummary });
      return { ran: true, orders: pending };
    },
  };
}
