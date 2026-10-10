/** Registers a tiny service worker that keeps the background video and icons on the device. */
export function registerOfflineCache() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  // Skip inside the editor preview iframe.
  if (window.self !== window.top) return;
  navigator.serviceWorker.register("/media-sw.js").catch(() => undefined);
}
