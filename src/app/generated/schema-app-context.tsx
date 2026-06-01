import { createContext, useContext, type ReactNode } from "react";
import {
  clientTargetForSchemaKey,
  type ClientAppSchemaKey,
  type ClientAppTarget,
} from "../../client/app-target.ts";
import { defaultSchemaKey } from "../../shared/schema-apps.ts";

type SchemaAppContextValue = {
  schemaKey: ClientAppSchemaKey;
  target: ClientAppTarget;
};

const SchemaAppContext = createContext<SchemaAppContextValue>({
  schemaKey: defaultSchemaKey,
  target: defaultSchemaKey,
});

export function SchemaAppProvider({
  children,
  schemaKey,
  target,
}: {
  children: ReactNode;
  schemaKey: ClientAppSchemaKey;
  target?: ClientAppTarget;
}) {
  const appTarget = target ?? clientTargetForSchemaKey(schemaKey);

  return (
    <SchemaAppContext.Provider value={{ schemaKey, target: appTarget }}>
      {children}
    </SchemaAppContext.Provider>
  );
}

export function useSchemaKey() {
  return useContext(SchemaAppContext).schemaKey;
}

export function useSchemaAppTarget() {
  return useContext(SchemaAppContext).target;
}
