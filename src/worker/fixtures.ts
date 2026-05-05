import { getWorkerSchemaAppDefinition } from "./schema-apps.ts";

export const taskSeedRecords = getWorkerSchemaAppDefinition("tasks").seedRecords;
export const rateCardSeedRecords = getWorkerSchemaAppDefinition("rates").seedRecords;
