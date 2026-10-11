const singleLine = (value, max = 120) =>
  String(value ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

export function formatReceipt(payload) {
  const customer = singleLine(payload?.customerName, 120);
  if (!customer) throw new Error("Receipt payload has no customer name");

  if (!Array.isArray(payload?.items) || payload.items.length === 0 || payload.items.length > 200) {
    throw new Error("Receipt payload must contain between 1 and 200 item lines");
  }

  const lines = ["Customer: " + customer, ""];
  for (const item of payload.items) {
    const name = singleLine(item?.item, 120);
    const quantity = Number(item?.quantity);
    if (!name) throw new Error("Receipt item name is missing");
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Receipt item quantity must be a positive number");
    }
    const displayedQuantity = Number.isInteger(quantity)
      ? String(quantity)
      : quantity.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    lines.push(name, "Qty: " + displayedQuantity, "");
  }

  // Do not include internal order IDs, pricing or other customer data on this slip.
  return lines.join("\r\n").trimEnd() + "\r\n";
}
