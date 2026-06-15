import { describe, expect, it } from 'vitest';
import { cloneArrayBuffer } from '@/lib/utils/buffer';

describe('cloneArrayBuffer', () => {
  it('copies bytes into a new buffer', () => {
    const original = new TextEncoder().encode('hello').buffer;
    const copy = cloneArrayBuffer(original);
    expect(copy).not.toBe(original);
    expect(new TextDecoder().decode(copy)).toBe('hello');
  });

  it('works when original is empty', () => {
    const copy = cloneArrayBuffer(new ArrayBuffer(0));
    expect(copy.byteLength).toBe(0);
  });
});
