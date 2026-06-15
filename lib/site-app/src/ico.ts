export type IcoPngEntry = {
  height: number;
  png: Uint8Array;
  width: number;
};

const ICO_HEADER_BYTES = 6;
const ICO_DIRECTORY_ENTRY_BYTES = 16;

export function encodeIcoFromPngs(entries: IcoPngEntry[]): Uint8Array {
  if (entries.length === 0) {
    throw new Error("ICO requires at least one PNG entry.");
  }

  for (const entry of entries) {
    assertIcoDimension(entry.width, "width");
    assertIcoDimension(entry.height, "height");

    if (entry.png.byteLength === 0) {
      throw new Error("ICO PNG entries must not be empty.");
    }
  }

  const directoryBytes = ICO_DIRECTORY_ENTRY_BYTES * entries.length;
  const payloadOffset = ICO_HEADER_BYTES + directoryBytes;
  const payloadBytes = entries.reduce((sum, entry) => sum + entry.png.byteLength, 0);
  const bytes = new Uint8Array(payloadOffset + payloadBytes);
  const view = new DataView(bytes.buffer);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);

  let imageOffset = payloadOffset;

  entries.forEach((entry, index) => {
    const directoryOffset = ICO_HEADER_BYTES + index * ICO_DIRECTORY_ENTRY_BYTES;

    bytes[directoryOffset] = icoDimensionByte(entry.width);
    bytes[directoryOffset + 1] = icoDimensionByte(entry.height);
    bytes[directoryOffset + 2] = 0;
    bytes[directoryOffset + 3] = 0;
    view.setUint16(directoryOffset + 4, 1, true);
    view.setUint16(directoryOffset + 6, 32, true);
    view.setUint32(directoryOffset + 8, entry.png.byteLength, true);
    view.setUint32(directoryOffset + 12, imageOffset, true);

    bytes.set(entry.png, imageOffset);
    imageOffset += entry.png.byteLength;
  });

  return bytes;
}

function assertIcoDimension(value: number, name: string) {
  if (!Number.isInteger(value) || value < 1 || value > 256) {
    throw new Error(`ICO ${name} must be an integer from 1 to 256.`);
  }
}

function icoDimensionByte(value: number): number {
  return value === 256 ? 0 : value;
}
