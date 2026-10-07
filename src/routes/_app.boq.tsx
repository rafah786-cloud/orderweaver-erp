import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveRawMaterial, saveProductModel } from "@/lib/boq-admin.functions";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader, PageBody } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Trash2, Pencil, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/_app/boq")({ component: BoqPage });

type RawMaterial = {
  id: string;
  code: string | null;
  name: string;
  unit: string;
  current_stock: number;
  reorder_level: number;
  notes: string | null;
};
type ProductModel = {
  id: string;
  code: string | null;
  name: string;
  size: string | null;
  thickness: string | null;
  cover_fabric: string | null;
  foam_density: string | null;
  warranty: string | null;
  default_price: number;
  extra_specs: Record<string, string>;
  notes: string | null;
};
type BoqRow = { id: string; raw_material_id: string; quantity_per_unit: number };

function BoqPage() {
  const { hasAnyRole } = useAuth();
  const canEditMaterials = hasAnyRole(["admin", "production"]);
  const canEditModels = hasAnyRole(["admin", "sales", "production"]);

  return (
    <>
      <PageHeader
        title="Bill of Quantities"
        description="Raw-material stock and per-model recipes."
      />
      <PageBody>
        <Tabs defaultValue="materials">
          <TabsList>
            <TabsTrigger value="materials">Raw Materials</TabsTrigger>
            <TabsTrigger value="models">Models & Recipes</TabsTrigger>
          </TabsList>
          <TabsContent value="materials">
            <MaterialsTab canEdit={canEditMaterials} />
          </TabsContent>
          <TabsContent value="models">
            <ModelsTab canEdit={canEditModels} />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}

/* ---------------- Raw materials ---------------- */

function MaterialsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const saveRawMaterialFn = useServerFn(saveRawMaterial);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<RawMaterial | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    unit: "pcs",
    reorder_level: 0,
    notes: "",
  });

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["raw-materials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_materials").select("*").order("name");
      if (!error && data) {
        for (const row of data) {
          // @ts-expect-error This RPC requires the unapplied accounting migration.
          const { data: onHand, error: handErr } = await supabase.rpc("material_on_hand", {
            p_material: row.id,
          });
          if (!handErr && onHand != null) row.current_stock = Number(onHand);
        }
      }
      if (error) throw error;
      return (data ?? []) as RawMaterial[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name required");
      return saveRawMaterialFn({
        data: {
          id: edit?.id,
          code: form.code || null,
          name: form.name,
          unit: form.unit,
          reorder_level: Number(form.reorder_level) || 0,
          notes: form.notes || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["raw-materials"] });
      setOpen(false);
      setEdit(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEdit(null);
    setForm({ code: "", name: "", unit: "pcs", reorder_level: 0, notes: "" });
    setOpen(true);
  };
  const openEdit = (m: RawMaterial) => {
    setEdit(m);
    setForm({
      code: m.code ?? "",
      name: m.name,
      unit: m.unit,
      reorder_level: m.reorder_level,
      notes: m.notes ?? "",
    });
    setOpen(true);
  };

  return (
    <Card className="mt-4">
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-4">
          <div className="text-sm text-muted-foreground">
            Stored quantity is shown. Movement posting is not installed, and opening stock has no
            value.
          </div>
          {canEdit && (
            <Button size="sm" onClick={openNew}>
              <Plus className="h-4 w-4 mr-1" />
              New Material
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Reorder</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : materials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No materials yet.
                </TableCell>
              </TableRow>
            ) : (
              materials.map((m) => {
                const low = m.reorder_level > 0 && m.current_stock <= m.reorder_level;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-xs">{m.code ?? "—"}</TableCell>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{m.unit}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${low ? "text-destructive" : ""}`}
                    >
                      {low && <AlertTriangle className="inline h-3 w-3 mr-1" />}
                      {Number(m.current_stock).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {Number(m.reorder_level).toLocaleString("en-IN")}
                    </TableCell>
                    <TableCell className="text-right">
                      {canEdit && (
                        <Button size="icon" variant="ghost" onClick={() => openEdit(m)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit ? "Edit Material" : "New Raw Material"}</DialogTitle>
            <DialogDescription>Stock is managed via purchase bills.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Unit *</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  placeholder="kg, m, pcs..."
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Reorder Level</Label>
              <Input
                type="number"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ---------------- Models & recipes ---------------- */

function ModelsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ProductModel | null>(null);

  const { data: models = [], isLoading } = useQuery({
    queryKey: ["product-models"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_models").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as ProductModel[];
    },
  });

  return (
    <Card className="mt-4">
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-4">
          <div className="text-sm text-muted-foreground">
            Sales team must pick a model when placing orders.
          </div>
          {canEdit && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              New Model
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Thickness</TableHead>
              <TableHead>Fabric</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : models.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No models yet.
                </TableCell>
              </TableRow>
            ) : (
              models.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.code ?? "—"}</TableCell>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>{m.size ?? "—"}</TableCell>
                  <TableCell>{m.thickness ?? "—"}</TableCell>
                  <TableCell>{m.cover_fabric ?? "—"}</TableCell>
                  <TableCell className="text-right">{inr(m.default_price)}</TableCell>
                  <TableCell className="text-right">
                    {canEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditing(m);
                          setEditorOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <ModelEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        model={editing}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["product-models"] });
        }}
      />
    </Card>
  );
}

function ModelEditor({
  open,
  onOpenChange,
  model,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  model: ProductModel | null;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!model;
  const [form, setForm] = useState({
    code: "",
    name: "",
    size: "",
    thickness: "",
    cover_fabric: "",
    foam_density: "",
    warranty: "",
    default_price: 0,
    notes: "",
  });
  const [extras, setExtras] = useState<{ k: string; v: string }[]>([]);
  const [recipe, setRecipe] = useState<{ raw_material_id: string; quantity_per_unit: number }[]>(
    [],
  );

  const { data: materials = [] } = useQuery({
    queryKey: ["raw-materials-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("raw_materials")
        .select("id, name, unit")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; unit: string }[];
    },
  });

  const { data: existingRecipe = [] } = useQuery({
    queryKey: ["model-boq", model?.id],
    enabled: !!model?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_boq")
        .select("id, raw_material_id, quantity_per_unit")
        .eq("model_id", model!.id);
      if (error) throw error;
      return (data ?? []) as BoqRow[];
    },
  });

  // hydrate when opening
  const hydrateKey = `${open}-${model?.id ?? "new"}`;
  if ((ModelEditor as any)._k !== hydrateKey) {
    (ModelEditor as any)._k = hydrateKey;
    if (open) {
      if (model) {
        setForm({
          code: model.code ?? "",
          name: model.name,
          size: model.size ?? "",
          thickness: model.thickness ?? "",
          cover_fabric: model.cover_fabric ?? "",
          foam_density: model.foam_density ?? "",
          warranty: model.warranty ?? "",
          default_price: model.default_price,
          notes: model.notes ?? "",
        });
        setExtras(Object.entries(model.extra_specs ?? {}).map(([k, v]) => ({ k, v: String(v) })));
      } else {
        setForm({
          code: "",
          name: "",
          size: "",
          thickness: "",
          cover_fabric: "",
          foam_density: "",
          warranty: "",
          default_price: 0,
          notes: "",
        });
        setExtras([]);
        setRecipe([]);
      }
    }
  }
  // load recipe rows when fetched
  if (model && existingRecipe.length && recipe.length === 0) {
    setRecipe(
      existingRecipe.map((r) => ({
        raw_material_id: r.raw_material_id,
        quantity_per_unit: r.quantity_per_unit,
      })),
    );
  }

  const saveProductModelFn = useServerFn(saveProductModel);
  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Model name required");
      if (recipe.length === 0 || recipe.some((r) => !r.raw_material_id || !(r.quantity_per_unit > 0)))
        throw new Error("Add at least one raw-material recipe line with quantity");
      const extra_specs = Object.fromEntries(extras.filter((e) => e.k.trim()).map((e) => [e.k.trim(), e.v]));
      return saveProductModelFn({
        data: {
          id: model?.id,
          code: form.code || null,
          name: form.name,
          size: form.size || null,
          thickness: form.thickness || null,
          cover_fabric: form.cover_fabric || null,
          foam_density: form.foam_density || null,
          warranty: form.warranty || null,
          default_price: Number(form.default_price) || 0,
          extra_specs,
          notes: form.notes || null,
          recipe: recipe.map((r) => ({
            raw_material_id: r.raw_material_id,
            quantity_per_unit: Number(r.quantity_per_unit),
          })),
        },
      });
    },
    onSuccess: () => {
      toast.success("Model saved");
      qc.invalidateQueries({ queryKey: ["product-models"] });
      qc.invalidateQueries({ queryKey: ["model-boq"] });
      onSaved();
      onOpenChange(false);
      (ModelEditor as any)._k = null;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) (ModelEditor as any)._k = null;
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Model" : "New Model"}</DialogTitle>
          <DialogDescription>Specifications + raw-material recipe.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Code</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs text-muted-foreground">Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Size</Label>
              <Input
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
                placeholder='72"x60"'
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Thickness</Label>
              <Input
                value={form.thickness}
                onChange={(e) => setForm({ ...form, thickness: e.target.value })}
                placeholder='6"'
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Foam Density</Label>
              <Input
                value={form.foam_density}
                onChange={(e) => setForm({ ...form, foam_density: e.target.value })}
                placeholder="40D"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Cover Fabric</Label>
              <Input
                value={form.cover_fabric}
                onChange={(e) => setForm({ ...form, cover_fabric: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Warranty</Label>
              <Input
                value={form.warranty}
                onChange={(e) => setForm({ ...form, warranty: e.target.value })}
                placeholder="10 years"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Default Price ₹</Label>
              <Input
                type="number"
                value={form.default_price}
                onChange={(e) => setForm({ ...form, default_price: Number(e.target.value) })}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Extra Specifications</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExtras([...extras, { k: "", v: "" }])}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {extras.map((row, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <Input
                    className="col-span-5"
                    placeholder="Key (e.g. Springs)"
                    value={row.k}
                    onChange={(e) =>
                      setExtras(extras.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))
                    }
                  />
                  <Input
                    className="col-span-6"
                    placeholder="Value"
                    value={row.v}
                    onChange={(e) =>
                      setExtras(extras.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))
                    }
                  />
                  <Button
                    className="col-span-1"
                    size="icon"
                    variant="ghost"
                    onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">Raw-Material Recipe *</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setRecipe([...recipe, { raw_material_id: "", quantity_per_unit: 0 }])
                }
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {recipe.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  No materials added. At least one is required.
                </div>
              )}
              {recipe.map((row, i) => {
                const unit = materials.find((m) => m.id === row.raw_material_id)?.unit ?? "";
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-7">
                      <Select
                        value={row.raw_material_id}
                        onValueChange={(v) =>
                          setRecipe(
                            recipe.map((x, j) => (j === i ? { ...x, raw_material_id: v } : x)),
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Material" />
                        </SelectTrigger>
                        <SelectContent>
                          {materials.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name} ({m.unit})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      className="col-span-3"
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="Qty / unit"
                      value={row.quantity_per_unit}
                      onChange={(e) =>
                        setRecipe(
                          recipe.map((x, j) =>
                            j === i ? { ...x, quantity_per_unit: Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                    <span className="col-span-1 text-xs text-muted-foreground">{unit}</span>
                    <Button
                      className="col-span-1"
                      size="icon"
                      variant="ghost"
                      onClick={() => setRecipe(recipe.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save Model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
