import { useEffect, useRef } from "react";
import { TURNSTILE_RESPONSE_FIELD_NAME } from "@dpeek/formless-public-operations";

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

type TurnstileRenderOptions = {
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  "response-field": boolean;
  "response-field-name": string;
  sitekey: string;
};

type FormlessTurnstileWindow = Window &
  typeof globalThis & {
    __formlessTurnstileApi?: Promise<TurnstileApi>;
    turnstile?: TurnstileApi;
  };

const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_SCRIPT_MARKER = "data-formless-turnstile-script";

export function TurnstileChallenge({
  onTokenChange,
  resetSignal,
  siteKey,
}: {
  onTokenChange: (token: string) => void;
  resetSignal: number;
  siteKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    let cancelled = false;
    setTurnstileToken(tokenInputRef.current, "");

    void loadTurnstileApi()
      .then((turnstile) => {
        const container = containerRef.current;

        if (cancelled || !container) {
          return;
        }

        const widgetId = turnstile.render(container, {
          callback: (token) => {
            setTurnstileToken(tokenInputRef.current, token);
            onTokenChangeRef.current(token);
          },
          "error-callback": () => {
            setTurnstileToken(tokenInputRef.current, "");
            onTokenChangeRef.current("");
          },
          "expired-callback": () => {
            setTurnstileToken(tokenInputRef.current, "");
            onTokenChangeRef.current("");
          },
          "response-field": true,
          "response-field-name": TURNSTILE_RESPONSE_FIELD_NAME,
          sitekey: siteKey,
        });

        widgetIdRef.current = widgetId;
        container.dataset.siteTurnstileWidgetId = widgetId;
      })
      .catch(() => {
        setTurnstileToken(tokenInputRef.current, "");
      });

    return () => {
      cancelled = true;
      const widgetId = widgetIdRef.current;
      widgetIdRef.current = undefined;
      delete containerRef.current?.dataset.siteTurnstileWidgetId;
      setTurnstileToken(tokenInputRef.current, "");

      if (widgetId) {
        browserWindow()?.turnstile?.remove(widgetId);
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal <= 0) {
      return;
    }

    setTurnstileToken(tokenInputRef.current, "");

    const widgetId = widgetIdRef.current;

    if (widgetId) {
      browserWindow()?.turnstile?.reset(widgetId);
    }
  }, [resetSignal]);

  return (
    <>
      <div
        data-site-turnstile
        data-sitekey={siteKey}
        ref={containerRef}
        style={{ minHeight: 65 }}
      />
      <input
        data-site-turnstile-token
        defaultValue=""
        name={TURNSTILE_RESPONSE_FIELD_NAME}
        ref={tokenInputRef}
        type="hidden"
      />
    </>
  );
}

function loadTurnstileApi(): Promise<TurnstileApi> {
  const windowObject = browserWindow();

  if (!windowObject) {
    return Promise.reject(new Error("Turnstile is only available in the browser."));
  }

  if (windowObject.turnstile) {
    return Promise.resolve(windowObject.turnstile);
  }

  if (windowObject.__formlessTurnstileApi) {
    return windowObject.__formlessTurnstileApi;
  }

  windowObject.__formlessTurnstileApi = new Promise<TurnstileApi>((resolve, reject) => {
    const existingScript = windowObject.document.querySelector<HTMLScriptElement>(
      `script[${TURNSTILE_SCRIPT_MARKER}="true"]`,
    );
    const script = existingScript ?? windowObject.document.createElement("script");

    const onLoad = () => {
      if (windowObject.turnstile) {
        resolve(windowObject.turnstile);
        return;
      }

      reject(new Error("Turnstile script loaded without exposing the API."));
    };
    const onError = () => {
      reject(new Error("Turnstile script failed to load."));
    };

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });

    if (!existingScript) {
      script.defer = true;
      script.src = TURNSTILE_SCRIPT_SRC;
      script.setAttribute(TURNSTILE_SCRIPT_MARKER, "true");
      windowObject.document.head.appendChild(script);
    }
  });

  return windowObject.__formlessTurnstileApi;
}

function browserWindow(): FormlessTurnstileWindow | undefined {
  return typeof window === "undefined" ? undefined : (window as FormlessTurnstileWindow);
}

function setTurnstileToken(input: HTMLInputElement | null, token: string) {
  if (input) {
    input.value = token;
  }
}
