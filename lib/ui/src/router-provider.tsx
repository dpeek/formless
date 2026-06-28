import { createContext, useContext, type ReactNode } from "react";

type Navigate = (href: string) => void;

const RouterContext = createContext<Navigate | undefined>(undefined);

export function RouterProvider({
  children,
  navigate,
}: {
  children: ReactNode;
  navigate: Navigate;
}) {
  return <RouterContext value={navigate}>{children}</RouterContext>;
}

export function useRouterNavigate() {
  return useContext(RouterContext);
}
