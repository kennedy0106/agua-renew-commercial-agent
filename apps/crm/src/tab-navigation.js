const TAB_NAVIGATION_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

export function nextTabValue(tabs, current, key) {
  if (!TAB_NAVIGATION_KEYS.has(key) || tabs.length === 0) return null;
  const index = tabs.findIndex(([value]) => value === current);
  if (index < 0) return null;
  const nextIndex =
    key === "Home"
      ? 0
      : key === "End"
        ? tabs.length - 1
        : (index + (key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  return tabs[nextIndex][0];
}
