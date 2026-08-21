/* eslint-disable @typescript-eslint/no-unused-expressions */
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { io as Client, type Socket } from 'socket.io-client';
import { createServerInstance } from '../../server.js';

let serverInstance: any;
let address: any;
let clientA: Socket | null = null;
let clientB: Socket | null = null;

function emitAck<T = any>(client: Socket, event: string, payload: any): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      client.emit(event, payload, (response: T) => {
        resolve(response);
      });
    } catch (err) {
      reject(err);
    }
  });
}

describe('socket integration', () => {
  beforeAll(async () => {
    serverInstance = await createServerInstance();
    address = await serverInstance.listen(0, '127.0.0.1');
    const port = address.port || address;
    const url = `http://127.0.0.1:${port}`;

    clientA = Client(url, { transports: ['websocket'] });
    clientB = Client(url, { transports: ['websocket'] });

    await Promise.all([
      new Promise<void>((res) => clientA!.once('connect', () => res())),
      new Promise<void>((res) => clientB!.once('connect', () => res())),
    ]);
  });

  afterAll(async () => {
    clientA && clientA.close();
    clientB && clientB.close();
    if (serverInstance) await serverInstance.close();
  });

  it('allows creating and joining a room and emits room-state', async () => {
    if (!clientA || !clientB) throw new Error('clients not initialized');

    const payload = await emitAck<any>(clientA, 'create-room', { nickname: 'Alice' });
    expect(payload).toHaveProperty('code');
    const code = payload.code;

    const joinPayload = await emitAck<any>(clientB, 'join-room', { roomCode: code, nickname: 'Bob' });
    expect(joinPayload.players.length).toBeGreaterThanOrEqual(2);
  });
});
