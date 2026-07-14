import { describe, it, expect } from 'vitest';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createCreativeRequestsStore } from '../src/store/creativeRequests.js';

describe('creativeRequests', () => {
  it('add + listOpen + dismiss', async () => {
    const s = createCreativeRequestsStore(createFakeFirestore());
    const r = await s.add({ funnel: 'caliente', concept: 'Uniforme invierno', styleNotes: 'fondo oscuro, tipografía bold', reason: 'ATC concentrado en 1 ad' });
    expect((await s.listOpen())).toHaveLength(1);
    await s.dismiss(r.id);
    expect((await s.listOpen())).toHaveLength(0);
  });
});
