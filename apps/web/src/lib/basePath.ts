/**
 * Adaptation pour un hébergement dans un sous-dossier (ex. /modelisation3d).
 * Définie à la génération par LAYERLING_BASE_PATH (voir next.config.ts). Vide = racine du site.
 */
export const BASE_PATH: string = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/** Préfixe un chemin absolu du site ("/occt/x.js") par le sous-dossier, s'il y en a un. */
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (!path.startsWith("/")) return path;
  return path === "/" ? `${BASE_PATH}/` : `${BASE_PATH}${path}`;
}
