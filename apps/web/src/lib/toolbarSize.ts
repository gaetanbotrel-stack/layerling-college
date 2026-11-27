export const TOOLBAR_SIZE_STORAGE_KEY = "layerling.toolbarSize";

export const TOOLBAR_SIZE_OPTIONS = ["small", "medium", "large"] as const;

export type ToolbarSize = (typeof TOOLBAR_SIZE_OPTIONS)[number];

export function normalizeToolbarSize(value: unknown): ToolbarSize {
  return value === "small" || value === "large" ? value : "medium";
}

/**
 * The size is a data attribute on <html>; globals.css turns it into
 * --toolbar-scale, and the browser scales the existing icons. Medium is the
 * plain stylesheet, so it carries no attribute.
 */
export function applyToolbarSize(size: ToolbarSize) {
  if (typeof document === "undefined") return;
  if (size === "medium") delete document.documentElement.dataset.toolbarSize;
  else document.documentElement.dataset.toolbarSize = size;
}

/**
 * Runs in <head> before the page paints, so a small or large bar does not
 * first show at medium and then jump.
 */
export const TOOLBAR_SIZE_BOOT_SCRIPT = `try{var s=localStorage.getItem(${JSON.stringify(TOOLBAR_SIZE_STORAGE_KEY)});if(s==="small"||s==="large")document.documentElement.dataset.toolbarSize=s}catch(e){}`;

function readStoredToolbarSize(): ToolbarSize {
  try {
    return normalizeToolbarSize(window.localStorage.getItem(TOOLBAR_SIZE_STORAGE_KEY));
  } catch {
    return "medium";
  }
}

const listeners = new Set<() => void>();
let currentToolbarSize: ToolbarSize = typeof window !== "undefined" ? readStoredToolbarSize() : "medium";

export function setToolbarSize(size: ToolbarSize) {
  currentToolbarSize = size;
  // Choisir une des trois tailles reprend la main sur le réglage fin.
  storeToolbarScale("preset");
  applyToolbarScale(null);
  try {
    window.localStorage.setItem(TOOLBAR_SIZE_STORAGE_KEY, size);
  } catch {
    // The size still applies for this session when storage is unavailable.
  }
  applyToolbarSize(size);
  listeners.forEach((listener) => listener());
}

export function getToolbarSize(): ToolbarSize {
  return currentToolbarSize;
}

/*
 * Collège : réglage fin de la taille des boutons, en pourcentage (50 à 150 %), en plus des trois tailles. Il passe par
 * des variables posées sur <html> (style en ligne), qui l'emportent sur les trois tailles et sur l'agrandissement du
 * mode simple. Sans choix enregistré, le mode simple prend 83 % : ses boutons à 125 % étaient trop grands (un tiers de
 * moins). « preset » enregistré = l'utilisateur a choisi une des trois tailles.
 */
export const TOOLBAR_SCALE_STORAGE_KEY = "layerling.toolbarScale";
export const TOOLBAR_SCALE_MIN = 50;
export const TOOLBAR_SCALE_MAX = 150;
export const SIMPLE_MODE_TOOLBAR_SCALE = 83;

export function normalizeToolbarScale(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= TOOLBAR_SCALE_MIN && number <= TOOLBAR_SCALE_MAX ? Math.round(number) : null;
}

function readStoredToolbarScale(): number | "preset" | null {
  try {
    const stored = window.localStorage.getItem(TOOLBAR_SCALE_STORAGE_KEY);
    return stored === "preset" ? "preset" : normalizeToolbarScale(stored);
  } catch {
    return null;
  }
}

function storeToolbarScale(value: number | "preset" | null) {
  try {
    if (value === null) window.localStorage.removeItem(TOOLBAR_SCALE_STORAGE_KEY);
    else window.localStorage.setItem(TOOLBAR_SCALE_STORAGE_KEY, String(value));
  } catch {
    // Sans stockage, le réglage vaut pour cette visite.
  }
}

/** The percentage in force, or null when one of the three sizes rules. */
export function effectiveToolbarScale(): number | null {
  if (typeof window === "undefined") return null;
  const stored = readStoredToolbarScale();
  if (stored === "preset") return null;
  if (stored !== null) return stored;
  return document.documentElement.dataset.simpleMode === "on" ? SIMPLE_MODE_TOOLBAR_SCALE : null;
}

/** The size the buttons are drawn at, in percent, whatever sets it. */
export function shownToolbarScale(): number {
  const scale = effectiveToolbarScale();
  if (scale !== null) return scale;
  if (typeof document === "undefined") return 100;
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--toolbar-scale"));
  return Number.isFinite(value) ? Math.round(value * 100) : 100;
}

export function applyToolbarScale(percent: number | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (percent === null) {
    root.style.removeProperty("--toolbar-scale");
    root.style.removeProperty("--editor-toolbar-tools-height");
    delete root.dataset.toolbarWrap;
    return;
  }
  const scale = percent / 100;
  root.style.setProperty("--toolbar-scale", String(scale));
  // Comme les trois tailles : la rangée d'outils grandit avec l'icône (65 px à 75 %, 76 px à 100 %, 87 px à 125 %).
  root.style.setProperty("--editor-toolbar-tools-height", `${Math.round(32 + 44 * scale)}px`);
  if (scale > 1.001) root.dataset.toolbarWrap = "on";
  else delete root.dataset.toolbarWrap;
}

/** null: back to the default (83 % in simple mode, the chosen size otherwise). */
export function setToolbarScale(percent: number | null) {
  const value = percent === null ? null : normalizeToolbarScale(percent);
  storeToolbarScale(value);
  applyToolbarScale(effectiveToolbarScale());
  listeners.forEach((listener) => listener());
}

/** Runs in <head> after the simple-mode script, so the bar does not first show at another size and then jump. */
export const TOOLBAR_SCALE_BOOT_SCRIPT = `try{var r=document.documentElement,v=localStorage.getItem(${JSON.stringify(TOOLBAR_SCALE_STORAGE_KEY)}),p=null;if(v!=="preset"){var n=Number(v);if(v!==null&&v!==""&&isFinite(n)&&n>=${TOOLBAR_SCALE_MIN}&&n<=${TOOLBAR_SCALE_MAX})p=Math.round(n);else if(r.dataset.simpleMode==="on")p=${SIMPLE_MODE_TOOLBAR_SCALE}}if(p!==null){var s=p/100;r.style.setProperty("--toolbar-scale",String(s));r.style.setProperty("--editor-toolbar-tools-height",Math.round(32+44*s)+"px");if(s>1.001)r.dataset.toolbarWrap="on"}}catch(e){}`;

export function subscribeToToolbarSize(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
