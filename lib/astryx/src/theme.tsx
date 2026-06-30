import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Theme } from "@astryxdesign/core";
import { neutralTheme } from "@astryxdesign/theme-neutral";

export type FormlessThemeMode = "system" | "light" | "dark";
export type FormlessFixedThemeMode = Exclude<FormlessThemeMode, "system">;
export type FormlessThemeModePolicy =
  | {
      type: "user";
      defaultMode?: FormlessThemeMode;
    }
  | {
      type: "fixed";
      mode: FormlessFixedThemeMode;
    };

type FormlessThemeContextValue = {
  canSetThemeMode: boolean;
  setThemeMode: (themeMode: FormlessThemeMode) => void;
};

export type FormlessThemeProviderProps = {
  children: ReactNode;
  modePolicy?: FormlessThemeModePolicy;
};

const FormlessThemeContext = createContext<FormlessThemeContextValue | null>(null);

const storageKey = "formless-astryx-theme-mode";
const defaultThemeModePolicy: FormlessThemeModePolicy = {
  type: "user",
  defaultMode: "system",
};

export function FormlessThemeProvider({
  children,
  modePolicy = defaultThemeModePolicy,
}: FormlessThemeProviderProps) {
  const isUserControlled = modePolicy.type === "user";
  const defaultThemeMode =
    modePolicy.type === "user" ? modePolicy.defaultMode ?? "system" : "system";
  const [userThemeMode, setUserThemeMode] = useStoredFormlessThemeMode(
    defaultThemeMode,
    isUserControlled,
  );
  const themeMode = modePolicy.type === "fixed" ? modePolicy.mode : userThemeMode;

  const setThemeMode = useCallback(
    (nextThemeMode: FormlessThemeMode) => {
      if (!isUserControlled) {
        return;
      }

      setUserThemeMode(nextThemeMode);
    },
    [isUserControlled, setUserThemeMode],
  );
  const themeContextValue = useMemo(
    () => ({
      canSetThemeMode: isUserControlled,
      setThemeMode,
    }),
    [isUserControlled, setThemeMode],
  );

  return (
    <FormlessThemeContext.Provider value={themeContextValue}>
      <Theme theme={neutralTheme} mode={themeMode}>
        {children}
      </Theme>
    </FormlessThemeContext.Provider>
  );
}

export function useFormlessThemeModeActions() {
  const context = useContext(FormlessThemeContext);

  if (!context) {
    throw new Error("useFormlessThemeModeActions must be used within FormlessThemeProvider.");
  }

  return context;
}

function useStoredFormlessThemeMode(defaultThemeMode: FormlessThemeMode, isEnabled: boolean) {
  const [themeMode, setThemeModeState] = useState(defaultThemeMode);

  useEffect(() => {
    if (!isEnabled) {
      setThemeModeState(defaultThemeMode);
      return;
    }

    setThemeModeState(readStoredThemeMode() ?? defaultThemeMode);
  }, [defaultThemeMode, isEnabled]);

  const setThemeMode = useCallback(
    (nextThemeMode: FormlessThemeMode) => {
      setThemeModeState(nextThemeMode);

      if (isEnabled) {
        window.localStorage.setItem(storageKey, nextThemeMode);
      }
    },
    [isEnabled],
  );

  return [themeMode, setThemeMode] as const;
}

function readStoredThemeMode(): FormlessThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedThemeMode = window.localStorage.getItem(storageKey);

  if (isFormlessThemeMode(storedThemeMode)) {
    return storedThemeMode;
  }

  if (storedThemeMode !== null) {
    window.localStorage.removeItem(storageKey);
  }

  return null;
}

function isFormlessThemeMode(value: string | null): value is FormlessThemeMode {
  return value === "system" || value === "light" || value === "dark";
}
