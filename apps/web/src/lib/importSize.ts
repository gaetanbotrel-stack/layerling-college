import * as THREE from "three";
import { t } from "@/lib/i18n";
import { rotatedGeometryShapePatch } from "@/lib/geometryRotation";
import { scaledHorizontalShapePatch, worldBoxOfShapes } from "@/lib/scaleByPercent";
import { cleanNearZero } from "@/lib/workplaneShapes";
import type { WorkplaneShape } from "@/types/layerling";

/**
 * Collège : un objet 3D importé (OBJ, STL, 3MF, STEP) demande à quelle taille il doit arriver, puis se pose au milieu
 * du plateau, le dessous sur le plateau. Un modèle d'un autre logiciel est souvent en mètres (un escalier de Sweet
 * Home 3D arrive haut de 1,4 mm) ou très loin de l'origine : l'élève ne le trouvait pas ou ne le voyait pas.
 * Les SVG, images et DXF gardent leur propre réglage (largeur, place sur la page) et ne passent pas par ici.
 */

const SIZED_IMPORT = /\.(obj|stl|3mf|step|stp)$/i;
const MIN_SIZE = 0.01;
const MAX_SIZE = 5000;

/** Whether the files read in hold a 3D model that is asked for its size (an OBJ inside a ZIP counts: the list is unpacked). */
export function importNeedsSize(files: readonly File[]) {
  return files.some((file) => SIZED_IMPORT.test(file.name));
}

/** The box the imported bodies take up together, in mm: across (X), deep (Y of the plate) and high. */
export function importedSize(shapes: readonly WorkplaneShape[]) {
  const size = worldBoxOfShapes(shapes).getSize(new THREE.Vector3());
  return { width: size.x, depth: size.z, height: size.y, largest: Math.max(size.x, size.y, size.z) };
}

/** The size offered in the window: the model's own when it is a sensible print size, 50 mm otherwise. */
export function suggestedLargestSide(largest: number) {
  return largest >= 5 && largest <= 250 ? Math.round(largest * 100) / 100 : 50;
}

/**
 * The bodies stood up: many programs (Blender, Sweet Home 3D, Fusion…) write files with Z up, which Layerling reads
 * with Y up, so a staircase arrives lying on its side. A quarter turn about X around the middle of their common box
 * puts the file's Z axis upright; the parts keep their layout.
 */
export function uprightImport(shapes: readonly WorkplaneShape[]): WorkplaneShape[] {
  if (!shapes.length) return [];
  const pivot = worldBoxOfShapes(shapes).getCenter(new THREE.Vector3());
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  return shapes.map((shape) => ({ ...shape, ...rotatedGeometryShapePatch(shape, turn, pivot) }));
}

/**
 * The bodies scaled together so that the largest side of their common box is `largest` mm (null: their own size),
 * then moved so that this box stands in the middle of the plate with its bottom on it. The proportions and the
 * layout of several parts are kept, as with « Échelle en pourcentage », but without its ×10 limit.
 */
export function sizedAndCentredImport(shapes: readonly WorkplaneShape[], largest: number | null, upright = false): WorkplaneShape[] {
  if (!shapes.length) return [];
  let out: WorkplaneShape[] = upright ? uprightImport(shapes) : [...shapes];
  const before = importedSize(out);
  if (largest !== null && Number.isFinite(largest) && largest > 0 && before.largest > 1e-9) {
    const factor = largest / before.largest;
    const box = worldBoxOfShapes(out);
    const middle = box.getCenter(new THREE.Vector3());
    const fromY = box.min.y;
    out = out.map((shape) => {
      const centreY = (shape.elevation ?? 0) + shape.height / 2;
      const height = Math.max(MIN_SIZE, shape.height * factor);
      const nextCentreY = fromY + (centreY - fromY) * factor;
      return {
        ...shape,
        ...scaledHorizontalShapePatch(shape, factor, factor),
        height,
        x: middle.x + (shape.x - middle.x) * factor,
        z: middle.z + (shape.z - middle.z) * factor,
        elevation: nextCentreY - height / 2,
      };
    });
  }
  const box = worldBoxOfShapes(out);
  const centre = box.getCenter(new THREE.Vector3());
  return out.map((shape) => ({
    ...shape,
    x: cleanNearZero(shape.x - centre.x, 0.0005),
    z: cleanNearZero(shape.z - centre.z, 0.0005),
    elevation: cleanNearZero((shape.elevation ?? 0) - box.min.y, 0.0005),
  }));
}

export type ImportSizeChoice = { largest: number | null; upright: boolean };

function formatMm(value: number) {
  const rounded = value >= 100 ? Math.round(value) : value >= 10 ? Math.round(value * 10) / 10 : Math.round(value * 100) / 100;
  return rounded.toLocaleString(document.documentElement.lang || undefined);
}

/**
 * The window that asks the size: the model's size in the file, one field for its largest side, and three buttons
 * (import at this size, keep its own size, cancel). Plain DOM, so the editor and the start page share it.
 * Resolves with the choice, or null when the import is cancelled (Escape counts as cancel).
 */
export function askImportSize(shapes: readonly WorkplaneShape[]): Promise<ImportSizeChoice | null> {
  const size = importedSize(shapes);
  const uprightSize = importedSize(uprightImport(shapes));
  const sizeText = (s: ReturnType<typeof importedSize>) => `${formatMm(s.width)} × ${formatMm(s.depth)} × ${formatMm(s.height)}`;
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "import-size-dialog";
    dialog.setAttribute("aria-labelledby", "import-size-title");
    dialog.style.cssText = "position:fixed;inset:0;margin:auto;height:fit-content;border:none;border-radius:14px;padding:22px 24px;max-width:min(440px,calc(100vw - 32px));box-shadow:0 18px 50px rgba(0,0,0,.35);font:16px/1.45 system-ui,'Segoe UI',sans-serif;color:#2d241b;background:#fffaf3";
    const title = document.createElement("h2");
    title.id = "import-size-title";
    title.textContent = t("importSize.title");
    title.style.cssText = "margin:0 0 6px;font-size:20px";
    const current = document.createElement("p");
    current.textContent = t("importSize.current", { size: sizeText(size) });
    current.style.cssText = "margin:0 0 14px;color:#6b5a48";
    const label = document.createElement("label");
    label.textContent = t("importSize.label");
    label.style.cssText = "display:block;font-weight:700;margin-bottom:6px";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0.01";
    input.max = String(MAX_SIZE);
    input.step = "any";
    input.inputMode = "decimal";
    input.value = String(suggestedLargestSide(size.largest));
    input.className = "import-size-input";
    input.style.cssText = "width:100%;box-sizing:border-box;font-size:20px;padding:8px 10px;border:2px solid #c97a2b;border-radius:10px;background:#fff;color:#2d241b";
    label.appendChild(document.createElement("br"));
    label.appendChild(input);
    const uprightLabel = document.createElement("label");
    uprightLabel.style.cssText = "display:flex;gap:8px;align-items:flex-start;margin-top:12px;cursor:pointer";
    const upright = document.createElement("input");
    upright.type = "checkbox";
    upright.className = "import-size-upright";
    upright.style.cssText = "width:20px;height:20px;margin:2px 0 0;flex:none;accent-color:#c97a2b";
    const uprightText = document.createElement("span");
    const uprightTitle = document.createElement("strong");
    uprightTitle.textContent = t("importSize.upright");
    const uprightHelp = document.createElement("span");
    uprightHelp.textContent = t("importSize.uprightHint");
    uprightHelp.style.cssText = "display:block;font-size:14px;color:#6b5a48";
    uprightText.append(uprightTitle, uprightHelp);
    uprightLabel.append(upright, uprightText);
    upright.addEventListener("change", () => {
      current.textContent = t("importSize.current", { size: sizeText(upright.checked ? uprightSize : size) });
    });
    const hint = document.createElement("p");
    hint.textContent = t("importSize.hint");
    hint.style.cssText = "margin:10px 0 0;font-size:14px;color:#6b5a48";
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    error.style.cssText = "margin:8px 0 0;font-size:14px;color:#b3402f;min-height:1em";
    const buttons = document.createElement("div");
    buttons.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:18px";
    const makeButton = (text: string, primary: boolean, name: string) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.dataset.importSize = name;
      button.style.cssText = primary
        ? "font:inherit;font-weight:700;padding:9px 16px;border-radius:10px;border:none;background:#c97a2b;color:#fff;cursor:pointer"
        : "font:inherit;padding:9px 14px;border-radius:10px;border:1px solid #d9c7b0;background:#fff;color:#2d241b;cursor:pointer";
      return button;
    };
    const cancel = makeButton(t("importSize.cancel"), false, "cancel");
    const keep = makeButton(t("importSize.keep"), false, "keep");
    const apply = makeButton(t("importSize.apply"), true, "apply");
    buttons.append(cancel, keep, apply);
    dialog.append(title, current, label, uprightLabel, hint, error, buttons);

    let done = false;
    const finish = (choice: ImportSizeChoice | null) => {
      if (done) return;
      done = true;
      dialog.close();
      dialog.remove();
      resolve(choice);
    };
    const applySize = () => {
      const value = Number(String(input.value).replace(",", "."));
      if (!Number.isFinite(value) || value < MIN_SIZE || value > MAX_SIZE) {
        error.textContent = t("importSize.invalid");
        input.focus();
        return;
      }
      finish({ largest: value, upright: upright.checked });
    };
    apply.addEventListener("click", applySize);
    keep.addEventListener("click", () => finish({ largest: null, upright: upright.checked }));
    cancel.addEventListener("click", () => finish(null));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applySize();
      }
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    input.select();
  });
}
