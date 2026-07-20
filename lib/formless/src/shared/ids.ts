export function createOperationId() {
  return createId("operation");
}

export function createRecordId() {
  return createId("record");
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
