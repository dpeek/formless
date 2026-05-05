import { getWorkerSchemaAppDefinition } from "../worker/schema-apps.ts";

export const taskSourceApp = getWorkerSchemaAppDefinition("tasks");
export const rateSourceApp = getWorkerSchemaAppDefinition("rates");

export const taskSourceSchema = taskSourceApp.sourceSchema;
export const rateSourceSchema = rateSourceApp.sourceSchema;

export const taskSeedRecords = taskSourceApp.seedRecords;
export const rateSeedRecords = rateSourceApp.seedRecords;
