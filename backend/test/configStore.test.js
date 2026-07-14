import { describe, it, expect } from 'vitest';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createConfigStore } from '../src/config/configStore.js';

describe('configStore', () => {
  it('devuelve defaults si no hay doc guardado', async () => {
    const store = createConfigStore(createFakeFirestore());
    const c = await store.get();
    expect(c.targetRoasFloor).toBe(7);
    expect(c.metaSurcharge).toBe(1.3);
    expect(c.autonomousMode).toBe(true);
  });
  it('mergea overrides guardados sobre defaults', async () => {
    const store = createConfigStore(createFakeFirestore());
    await store.update({ taxPct: 0.05 });
    const c = await store.get();
    expect(c.taxPct).toBe(0.05);
    expect(c.metaSurcharge).toBe(1.3); // default intacto
  });
});
