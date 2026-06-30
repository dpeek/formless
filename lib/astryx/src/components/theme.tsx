import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { useTheme } from "@astryxdesign/core/theme";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { useFormlessThemeModeActions } from "../theme.tsx";

const LightModeIcon = SunIcon;
const DarkModeIcon = MoonIcon;

export function FormlessThemeToggle() {
  const { mode } = useTheme();
  const { canSetThemeMode, setThemeMode } = useFormlessThemeModeActions();
  const nextThemeMode = mode === "dark" ? "light" : "dark";
  const label = nextThemeMode === "dark" ? "Dark mode" : "Light mode";
  const ThemeIcon = mode === "dark" ? LightModeIcon : DarkModeIcon;

  if (!canSetThemeMode) {
    return null;
  }

  return (
    <IconButton
      label={label}
      tooltip={label}
      variant="ghost"
      icon={<Icon icon={ThemeIcon} color="inherit" size="sm" />}
      onClick={() => setThemeMode(nextThemeMode)}
    />
  );
}
