import { describe, expect, it } from "vitest";
import { importedSize, importNeedsSize, sizedAndCentredImport, suggestedLargestSide, uprightImport } from "@/lib/importSize";
import type { WorkplaneShape } from "@/types/layerling";

// Collège : un objet 3D importé arrive à la taille demandée, au milieu du plateau, posé dessus.
const box = (id: string, x: number, z: number, elevation: number, width: number, depth: number, height: number): WorkplaneShape => ({
  id, name: id, kind: "box", color: "#888888", x, z, elevation, size: Math.max(width, depth), width, depth, height, rotation: 0,
});

describe("taille et place d'un objet importé", () => {
  it("demande la taille pour un modèle 3D, pas pour un dessin", () => {
    expect(importNeedsSize([new File([""], "escalier.obj")])).toBe(true);
    expect(importNeedsSize([new File([""], "piece.STL"), new File([""], "logo.svg")])).toBe(true);
    expect(importNeedsSize([new File([""], "logo.svg"), new File([""], "plan.dxf")])).toBe(false);
  });

  it("propose 50 mm pour un modèle en mètres, sa propre taille sinon", () => {
    expect(suggestedLargestSide(1.42)).toBe(50);
    expect(suggestedLargestSide(80)).toBe(80);
    expect(suggestedLargestSide(1420)).toBe(50);
  });

  it("agrandit l'ensemble sans le limiter à ×10, garde les proportions et le centre au milieu du plateau", () => {
    // Un escalier en mètres, loin de l'origine : 0,84 × 0,91 × 1,42, posé à 3 sous le plateau.
    const parts = [box("marches", 100.42, -50.455, -3, 0.84, 0.91, 0.5), box("poteau", 100.1, -50.2, -3, 0.2, 0.2, 1.42)];
    const placed = sizedAndCentredImport(parts, 50);
    const size = importedSize(placed);
    expect(size.largest).toBeCloseTo(50, 6);
    expect(size.height).toBeCloseTo(50, 6);
    expect(size.width / size.height).toBeCloseTo(0.84 / 1.42, 6);
    const xs = placed.flatMap((shape) => [shape.x - shape.width! / 2, shape.x + shape.width! / 2]);
    const zs = placed.flatMap((shape) => [shape.z - shape.depth! / 2, shape.z + shape.depth! / 2]);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 3);
    expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(0, 3);
    expect(Math.min(...placed.map((shape) => shape.elevation ?? 0))).toBeCloseTo(0, 3);
  });

  it("« Garder sa taille » ne change pas la taille mais pose quand même l'objet au milieu du plateau", () => {
    const parts = [box("piece", 200, 150, 12, 30, 20, 10)];
    const placed = sizedAndCentredImport(parts, null);
    expect(placed[0].width).toBe(30);
    expect(placed[0].depth).toBe(20);
    expect(placed[0].height).toBe(10);
    expect(placed[0].x).toBeCloseTo(0, 6);
    expect(placed[0].z).toBeCloseTo(0, 6);
    expect(placed[0].elevation).toBeCloseTo(0, 6);
  });

  it("« Redresser » met debout un objet couché (haut = Z dans le fichier), posé au milieu du plateau", () => {
    // Poteau d'escalier couché : long de 1,42 en profondeur, 0,2 de haut.
    const lying = [box("poteau", 5, 7, 0, 0.2, 1.42, 0.2)];
    expect(importedSize(uprightImport(lying)).height).toBeCloseTo(1.42, 6);
    const placed = sizedAndCentredImport(lying, 50, true);
    const size = importedSize(placed);
    expect(size.height).toBeCloseTo(50, 6);
    expect(size.depth).toBeCloseTo(50 * 0.2 / 1.42, 6);
    expect(placed[0].x).toBeCloseTo(0, 6);
    expect(placed[0].z).toBeCloseTo(0, 6);
    expect(((placed[0].rotationX ?? 0) + 360) % 180).toBeCloseTo(90, 6);
    const bottom = placed[0].elevation! + placed[0].height / 2 - size.height / 2;
    expect(bottom).toBeCloseTo(0, 3);
  });
});
