try {
  const theme =
    localStorage.getItem("truecare-theme") === "dark" ? "dark" : "light";
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.dataset.ktThemeMode = theme;
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#09090b" : "#ffffff");
} catch {
  /* Account preference is applied after sign-in when storage is unavailable. */
}
