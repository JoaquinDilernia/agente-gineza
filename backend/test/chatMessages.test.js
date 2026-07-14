import { describe, it, expect } from 'vitest';
import { createFakeFirestore } from './helpers/fakeFirestore.js';
import { createChatMessagesStore } from '../src/store/chatMessages.js';

describe('chatMessages', () => {
  it('listRecent devuelve en orden cronológico (más viejo primero)', async () => {
    const s = createChatMessagesStore(createFakeFirestore());
    await s.add({ role: 'user', content: 'hola' });
    await s.add({ role: 'assistant', content: 'qué onda' });
    const list = await s.listRecent();
    expect(list.map((m) => m.content)).toEqual(['hola', 'qué onda']);
  });
});
