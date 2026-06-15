import { getWorkerSchemaAppDefinition } from "../worker/schema-apps.ts";
import rawRateCardSeedRecords from "./fixtures/rate-card-seed-records.json";
import rawRateCardSourceSchema from "./fixtures/rate-card-schema.json";
import { parseAppSchema } from "@dpeek/formless-schema";
import { parseWorkerSeedRecords } from "../worker/schema-apps.ts";

export const taskSourceApp = getWorkerSchemaAppDefinition("tasks");
export const siteSourceApp = getWorkerSchemaAppDefinition("site");
export const crmSourceApp = getWorkerSchemaAppDefinition("crm");

export const taskSourceSchema = taskSourceApp.sourceSchema;
export const rateSourceSchema = parseAppSchema(rawRateCardSourceSchema);
export const siteSourceSchema = siteSourceApp.sourceSchema;
export const crmSourceSchema = crmSourceApp.sourceSchema;

export const taskSeedRecords = taskSourceApp.seedRecords;
export const rateSeedRecords = parseWorkerSeedRecords(
  rawRateCardSeedRecords,
  rateSourceSchema,
  "rate-card seed records",
);
export const siteSeedRecords = siteSourceApp.seedRecords;
export const crmSeedRecords = crmSourceApp.seedRecords;
