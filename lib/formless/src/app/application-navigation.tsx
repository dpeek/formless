import { type ReactNode, useEffect } from "react";

export const APPLICATION_NATIVE_NAVIGATION_ATTRIBUTE = "data-formless-native-navigation";

export type ApplicationNavigationActivation = {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  currentHref: string;
  defaultPrevented: boolean;
  download: boolean;
  href: string;
  metaKey: boolean;
  nativeNavigation: boolean;
  shiftKey: boolean;
  target: string | null;
};

type ApplicationNavigationEventTarget = Pick<Document, "addEventListener" | "removeEventListener">;

export function applicationSpaNavigationTarget(
  activation: ApplicationNavigationActivation,
): string | undefined {
  if (
    activation.defaultPrevented ||
    activation.button !== 0 ||
    activation.metaKey ||
    activation.ctrlKey ||
    activation.altKey ||
    activation.shiftKey ||
    activation.download ||
    activation.nativeNavigation ||
    (activation.target !== null && activation.target !== "" && activation.target !== "_self")
  ) {
    return undefined;
  }

  const current = new URL(activation.currentHref);
  const destination = new URL(activation.href, current);
  if (
    (destination.protocol !== "http:" && destination.protocol !== "https:") ||
    destination.origin !== current.origin
  ) {
    return undefined;
  }
  if (
    destination.hash !== "" &&
    destination.pathname === current.pathname &&
    destination.search === current.search
  ) {
    return undefined;
  }

  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function installApplicationNavigationBridge({
  currentHref,
  navigate,
  target,
}: {
  currentHref: () => string;
  navigate: (href: string) => void;
  target: ApplicationNavigationEventTarget;
}) {
  const onClick = (event: Event) => {
    if (!(event instanceof MouseEvent)) {
      return;
    }

    const link = closestLink(event.target);
    if (!link) {
      return;
    }

    const href = applicationSpaNavigationTarget({
      altKey: event.altKey,
      button: event.button,
      ctrlKey: event.ctrlKey,
      currentHref: currentHref(),
      defaultPrevented: event.defaultPrevented,
      download: link.hasAttribute("download"),
      href: link.href,
      metaKey: event.metaKey,
      nativeNavigation: link.closest(`[${APPLICATION_NATIVE_NAVIGATION_ATTRIBUTE}]`) !== null,
      shiftKey: event.shiftKey,
      target: link.getAttribute("target"),
    });
    if (!href) {
      return;
    }

    event.preventDefault();
    navigate(href);
  };

  target.addEventListener("click", onClick);
  return () => target.removeEventListener("click", onClick);
}

export function ApplicationNavigationBridge({
  children,
  currentHref = () => window.location.href,
  navigate,
  target = document,
}: {
  children: ReactNode;
  currentHref?: () => string;
  navigate: (href: string) => void;
  target?: ApplicationNavigationEventTarget;
}) {
  useEffect(
    () => installApplicationNavigationBridge({ currentHref, navigate, target }),
    [currentHref, navigate, target],
  );

  return children;
}

function closestLink(target: EventTarget | null): HTMLAnchorElement | undefined {
  const candidate = target as { closest?(selector: string): Element | null } | null;
  const link = candidate?.closest?.("a[href]");
  return link instanceof HTMLAnchorElement ? link : undefined;
}
