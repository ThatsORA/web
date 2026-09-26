// Owner: Andy — current theme, following the OS light/dark setting.
import { useColorScheme } from "react-native";
import { themeFor, type Theme } from "./theme";

export function useTheme(): Theme {
  return themeFor(useColorScheme());
}
