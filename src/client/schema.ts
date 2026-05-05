import rawSchema from "../../schema/apps/tasks/schema.json";
import { parseAppSchema, stringifySchema } from "../shared/schema.ts";

export const appSchema = parseAppSchema(rawSchema);
export const appSchemaJson = stringifySchema(appSchema);
