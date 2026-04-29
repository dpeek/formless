export function createMutationId() {
  return createId("mutation");
}

export function createActionId() {
  return createId("action");
}

export function createRecordId() {
  return createId("record");
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
