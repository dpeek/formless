import { getWorkerSchemaAppDefinition } from "../worker/schema-apps.ts";

export const taskSourceApp = getWorkerSchemaAppDefinition("tasks");
export const rateSourceApp = getWorkerSchemaAppDefinition("estii");
export const siteSourceApp = getWorkerSchemaAppDefinition("site");
export const crmSourceApp = getWorkerSchemaAppDefinition("crm");
export const cleartraceSourceApp = getWorkerSchemaAppDefinition("cleartrace");

export const taskSourceSchema = taskSourceApp.sourceSchema;
export const rateSourceSchema = rateSourceApp.sourceSchema;
export const siteSourceSchema = siteSourceApp.sourceSchema;
export const crmSourceSchema = crmSourceApp.sourceSchema;
export const cleartraceSourceSchema = cleartraceSourceApp.sourceSchema;

export const taskSeedRecords = taskSourceApp.seedRecords;
export const rateSeedRecords = rateSourceApp.seedRecords;
export const siteSeedRecords = siteSourceApp.seedRecords;
export const crmSeedRecords = crmSourceApp.seedRecords;
export const cleartraceSeedRecords = cleartraceSourceApp.seedRecords;
