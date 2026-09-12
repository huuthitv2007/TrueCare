// Print only after the logo, stylesheet and local fonts have loaded.
window.addEventListener(
  "load",
  async () => {
    await document.fonts.ready;
    window.print();
  },
  { once: true },
);
