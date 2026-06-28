"use client";

import { useCallback, type MouseEventHandler } from "react";
import {
  Link as LinkPrimitive,
  type LinkProps as LinkPrimitiveProps,
} from "react-aria-components/Link";
import { cx } from "./primitive";
import { useRouterNavigate } from "./router-provider";

export interface LinkProps extends LinkPrimitiveProps {
  onClickCapture?: MouseEventHandler<HTMLAnchorElement>;
  ref?: React.RefObject<HTMLAnchorElement>;
}

export function Link({ className, href, onClickCapture, ref, ...props }: LinkProps) {
  const navigate = useRouterNavigate();
  const handleClickCapture = useCallback<MouseEventHandler<HTMLAnchorElement>>(
    (event) => {
      onClickCapture?.(event);

      if (
        event.defaultPrevented ||
        !href ||
        !navigate ||
        !shouldClientNavigate(event.currentTarget, event)
      ) {
        return;
      }

      event.preventDefault();
      navigate(clientRouteHref(event.currentTarget));
    },
    [href, navigate, onClickCapture],
  );

  return (
    <LinkPrimitive
      ref={ref}
      href={href}
      onClickCapture={handleClickCapture}
      className={cx(
        "font-medium text-(--text)",
        "outline-0 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring forced-colors:outline-[Highlight]",
        "disabled:cursor-default disabled:opacity-50 forced-colors:disabled:text-[GrayText]",
        href && "cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

function shouldClientNavigate(link: HTMLAnchorElement, event: React.MouseEvent<HTMLAnchorElement>) {
  const target = link.getAttribute("target");

  return (
    event.button === 0 &&
    (!target || target === "_self") &&
    link.origin === window.location.origin &&
    !link.hasAttribute("download") &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

function clientRouteHref(link: HTMLAnchorElement) {
  return `${link.pathname}${link.search}${link.hash}`;
}
