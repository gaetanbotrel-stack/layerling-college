"use client";

import { useEffect } from "react";
import { offlineAvailable } from "@/lib/offlineSupport";

/**
 * Registers the service worker that keeps layerling on the visitor's computer
 * for offline use. It exists only in the static export (scripts/
 * generate-service-worker.mjs writes it), and browsers only allow one on
 * https or localhost - a plain-http address such as the home server simply
 * runs without it, as before.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    // Hébergé dans un sous-dossier (collège) : pas de copie hors ligne, 160 Mo par poste n'ont pas d'intérêt en classe.
    if (process.env.NEXT_PUBLIC_BASE_PATH) return;
    if (!offlineAvailable()) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Without it layerling works exactly as before, just not offline.
    });
  }, []);
  return null;
}
