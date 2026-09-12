export type Theme = "light" | "dark";

export function readTheme(key: string, fallback: Theme = "light"): Theme {
  try {
    const value = localStorage.getItem(key);
    return value === "light" || value === "dark" ? value : fallback;
  } catch {
    return fallback;
  }
}

export function applyTheme(theme: Theme, userId?: string) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.dataset.ktThemeMode = theme;
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#09090b" : "#ffffff");
  try {
    localStorage.setItem("truecare-theme", theme);
    if (userId) localStorage.setItem(`truecare-theme:${userId}`, theme);
  } catch {
    /* A disabled browser store must not prevent theme changes. */
  }
}
