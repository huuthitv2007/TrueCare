try {
  const theme = localStorage.getItem("truecare-theme");
  if (theme === "dark" || theme === "light") {
    document.documentElement.dataset.theme = theme;
  }
} catch {
  // Storage can be disabled; the application will use the account preference.
}
