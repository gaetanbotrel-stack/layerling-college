// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { importModelFiles } from "@/lib/modelImport";
import { t } from "@/lib/i18n";

// Collège : un STL vide ou qui n'en est pas un affichait « Offset is outside the bounds of the DataView ».
describe("fichier 3D abîmé", () => {
  it.each([
    ["vide.stl", "solid vide\nendsolid vide\n"],
    ["faux.stl", "pas un modele"],
  ])("%s : « Le fichier n'a pas pu être lu », rien d'importé", async (name, content) => {
    const result = (await importModelFiles([new File([content], name)]))!;
    expect(result.shapes).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toBe(t("status.importUnreadable"));
  });
});
