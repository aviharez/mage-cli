;(function () {
  var key = "opencode-theme-id"
  // Must mirror the theme JSONs shipped in packages/ui/src/theme/themes/.
  // Any saved id not in this set (a renamed/removed theme such as the old
  // "oc-1" or the deleted built-ins) is reset to the default below so we never
  // paint with a deleted theme's cached CSS.
  var KNOWN_THEMES = ["oc-2"]
  var themeId = localStorage.getItem(key) || "oc-2"

  if (themeId !== "oc-2" && KNOWN_THEMES.indexOf(themeId) === -1) {
    themeId = "oc-2"
    localStorage.setItem(key, themeId)
    localStorage.removeItem("opencode-theme-css-light")
    localStorage.removeItem("opencode-theme-css-dark")
  }

  var scheme = localStorage.getItem("opencode-color-scheme") || "system"
  var isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  var mode = isDark ? "dark" : "light"

  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode

  if (themeId === "oc-2") return

  var css = localStorage.getItem("opencode-theme-css-" + mode)
  if (css) {
    var style = document.createElement("style")
    style.id = "oc-theme-preload"
    style.textContent =
      ":root{color-scheme:" +
      mode +
      ";--text-mix-blend-mode:" +
      (isDark ? "plus-lighter" : "multiply") +
      ";" +
      css +
      "}"
    document.head.appendChild(style)
  }
})()
