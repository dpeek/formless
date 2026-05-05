import { createContext, useContext, type ReactNode } from "react";
import { defaultSchemaKey, type SchemaKey } from "../../shared/schema-apps.ts";

const SchemaAppContext = createContext<SchemaKey>(defaultSchemaKey);

export function SchemaAppProvider({
  children,
  schemaKey,
}: {
  children: ReactNode;
  schemaKey: SchemaKey;
}) {
  return <SchemaAppContext.Provider value={schemaKey}>{children}</SchemaAppContext.Provider>;
}

export function useSchemaKey() {
  return useContext(SchemaAppContext);
}
