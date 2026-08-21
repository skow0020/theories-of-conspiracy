import { describe, it, expect } from 'vitest';
import { normalizeRoomCode, generateRoomCode } from '../../server.js';

describe('room helpers', () => {
  it('normalizes room codes to CON- format', () => {
    expect(normalizeRoomCode('con-abc123')).toMatch(/^CON-/);
    expect(normalizeRoomCode('abc!@#')).toMatch(/^CON-/);
    expect(normalizeRoomCode('')).toBe('');
  });

  it('generateRoomCode returns expected format', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^CON-[A-Z0-9]{6}$/);
  });
});
