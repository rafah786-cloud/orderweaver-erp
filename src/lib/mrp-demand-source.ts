export interface ActiveProductionOrderRef {
  id: string;
  production_number: string;
  sales_order_id: string;
}

export interface ProductionOrderAssignment {
  unambiguousBySalesOrderId: Map<string, ActiveProductionOrderRef>;
  ambiguousSalesOrderIds: string[];
}

/**
 * MRP cannot infer split quantities because production_orders has no authoritative
 * planned/remaining quantity. Exclude sales orders with multiple active production
 * orders rather than assigning the full sales-order quantity to an arbitrary row.
 */
export function assignUnambiguousProductionOrders(
  orders: ActiveProductionOrderRef[],
): ProductionOrderAssignment {
  const grouped = new Map<string, ActiveProductionOrderRef[]>();
  for (const order of orders) {
    if (!order.id || !order.sales_order_id || !order.production_number.trim()) continue;
    const rows = grouped.get(order.sales_order_id) ?? [];
    rows.push(order);
    grouped.set(order.sales_order_id, rows);
  }

  const unambiguousBySalesOrderId = new Map<string, ActiveProductionOrderRef>();
  const ambiguousSalesOrderIds: string[] = [];
  for (const [salesOrderId, rows] of grouped) {
    if (rows.length === 1) unambiguousBySalesOrderId.set(salesOrderId, rows[0]);
    else ambiguousSalesOrderIds.push(salesOrderId);
  }
  return { unambiguousBySalesOrderId, ambiguousSalesOrderIds: ambiguousSalesOrderIds.sort() };
}
