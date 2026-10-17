export type MattressModel = {
  name: string;
  slug: string;
  code: string;
  tier: "unassigned";
  status: "draft";
};

const names = [
  "HTF",
  "ROYAL",
  "EDGE",
  "COIR MATTERSS",
  "MR. COIR",
  "MR. COIR MFM",
  "ELEGANT",
  "MR. COIR ATLAS",
  "MARS",
  "BYZ MAGIC NIGHT",
  "SOFT NIGHTS",
  "ARCHE",
  "ZIZZYCO MEDICATED",
  "DZIRE",
  "LAT NATURY",
  "ORTHO MEDI REST",
  "ZIZZ MATTRESS",
  "FOAM MATTRESS",
  "ORTHO BACK MAGIC",
  "DR. SPINE",
  "AERO SLEEP",
  "CLUSTER",
  "ZIZZ FOAMY",
] as const;

export const mattressModels: MattressModel[] = names.map((name, index) => ({
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  code: `ZIZZ-${String(index + 1).padStart(3, "0")}`,
  tier: "unassigned",
  status: "draft",
}));

export function findMattressModel(slug: string) {
  return mattressModels.find((model) => model.slug === slug);
}
