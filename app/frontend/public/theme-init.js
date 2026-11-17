// Runs before the page paints, so the chosen theme never flashes. The stored value is a convenience only.
try {
  var stored = localStorage.getItem("pi-theme");
  if (stored === "light" || stored === "dark") document.documentElement.dataset.theme = stored;
} catch (error) {
  /* storage can be blocked. The page then follows the system setting. */
}
