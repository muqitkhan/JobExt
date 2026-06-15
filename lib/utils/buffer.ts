/** Deep copy — safe even after pdf.js/mammoth detach the original buffer. */
export function cloneArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  if (buffer.byteLength === 0) return new ArrayBuffer(0);
  const copy = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copy).set(new Uint8Array(buffer));
  return copy;
}
