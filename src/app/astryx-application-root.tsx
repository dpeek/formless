import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { AstryxApplicationProvider } from "@dpeek/formless-astryx/application/provider";
import "@dpeek/formless-astryx/application/global.css";
import {
  ApplicationRuntimeContractHostProvider,
  useApplicationRuntimePublicationCoordinator,
} from "./generated/application-runtime-contract-host.tsx";
import {
  APPLICATION_THEME_CONTRIBUTOR_ID,
  applicationThemeReference,
  applicationThemeRuntimePublication,
  browserApplicationTheme,
  createApplicationThemeController,
  type ApplicationThemeController,
} from "./application-theme-runtime.ts";
import { ApplicationRootThemeRuntimeProvider } from "./application-root-context.tsx";
import { ApplicationNavigationBridge } from "./application-navigation.tsx";

type ApplicationNavigationEventTarget = Pick<Document, "addEventListener" | "removeEventListener">;

export function AstryxApplicationRoot({
  children,
  currentHref,
  navigate,
  navigationTarget,
  themeController: suppliedThemeController,
}: {
  children: ReactNode;
  currentHref?: () => string;
  navigate: (href: string) => void;
  navigationTarget?: ApplicationNavigationEventTarget;
  themeController?: ApplicationThemeController;
}) {
  const [ownedThemeController] = useState(() =>
    suppliedThemeController
      ? undefined
      : createApplicationThemeController(browserApplicationTheme()),
  );
  const themeController = suppliedThemeController ?? ownedThemeController;
  if (!themeController) {
    throw new Error("Astryx application root requires a browser theme controller.");
  }

  const theme = useSyncExternalStore(
    (listener) => themeController.subscribe(listener),
    () => themeController.getSnapshot(),
    () => themeController.getSnapshot(),
  );
  const publication = useMemo(
    () => applicationThemeRuntimePublication(themeController),
    [theme, themeController],
  );
  const coordinator = useApplicationRuntimePublicationCoordinator([
    [APPLICATION_THEME_CONTRIBUTOR_ID, publication],
  ]);
  const rootThemeRuntime = useMemo(
    () => ({ publication, reference: applicationThemeReference }),
    [publication],
  );

  useLayoutEffect(() => {
    coordinator.publish(APPLICATION_THEME_CONTRIBUTOR_ID, publication);
  }, [coordinator, publication]);

  useEffect(
    () => () => {
      ownedThemeController?.destroy();
    },
    [ownedThemeController],
  );

  return (
    <ApplicationRootThemeRuntimeProvider runtime={rootThemeRuntime}>
      <ApplicationRuntimeContractHostProvider coordinator={coordinator}>
        <AstryxApplicationProvider theme={theme}>
          <ApplicationNavigationBridge
            currentHref={currentHref}
            navigate={navigate}
            target={navigationTarget}
          >
            {children}
          </ApplicationNavigationBridge>
        </AstryxApplicationProvider>
      </ApplicationRuntimeContractHostProvider>
    </ApplicationRootThemeRuntimeProvider>
  );
}
