import { createContext, useContext, type ReactNode } from "react";
import type { ClientAppTarget } from "../../client/app-target.ts";
import { defaultSchemaKey, type SchemaKey } from "../../shared/schema-apps.ts";

type SchemaAppContextValue = {
  schemaKey: SchemaKey;
  target: ClientAppTarget;
};

const SchemaAppContext = createContext<SchemaAppContextValue>({
  schemaKey: defaultSchemaKey,
  target: defaultSchemaKey,
});

export function SchemaAppProvider({
  children,
  schemaKey,
  target = schemaKey,
}: {
  children: ReactNode;
  schemaKey: SchemaKey;
  target?: ClientAppTarget;
}) {
  return (
    <SchemaAppContext.Provider value={{ schemaKey, target }}>{children}</SchemaAppContext.Provider>
  );
}

export function useSchemaKey() {
  return useContext(SchemaAppContext).schemaKey;
}

export function useSchemaAppTarget() {
  return useContext(SchemaAppContext).target;
}
