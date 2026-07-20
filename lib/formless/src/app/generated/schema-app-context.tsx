import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  clientTargetForSchemaKey,
  type ClientAppSchemaKey,
  type ClientAppTarget,
} from "../../client/app-target.ts";
import { defaultSchemaKey } from "../../shared/schema-apps.ts";
import type { AppPackageResolver } from "@dpeek/formless-installed-apps";

type SchemaAppContextValue = {
  activePackageResolver?: AppPackageResolver | undefined;
  schemaKey: ClientAppSchemaKey;
  target: ClientAppTarget;
};

const SchemaAppContext = createContext<SchemaAppContextValue>({
  schemaKey: defaultSchemaKey,
  target: defaultSchemaKey,
});

export function SchemaAppProvider({
  activePackageResolver,
  children,
  schemaKey,
  target,
}: {
  activePackageResolver?: AppPackageResolver | undefined;
  children: ReactNode;
  schemaKey: ClientAppSchemaKey;
  target?: ClientAppTarget;
}) {
  const appTarget = target ?? clientTargetForSchemaKey(schemaKey);

  return (
    <SchemaAppContext.Provider value={{ activePackageResolver, schemaKey, target: appTarget }}>
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

export function useSchemaAppWriteOptions() {
  const { activePackageResolver } = useContext(SchemaAppContext);

  return useMemo(
    () => (activePackageResolver ? { activePackageResolver } : {}),
    [activePackageResolver],
  );
}
