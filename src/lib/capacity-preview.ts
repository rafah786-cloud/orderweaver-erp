export interface CapacityOperation {
  id: string;
  status: string;
  planned_qty: number;
  planned_start: string | null;
  planned_end: string | null;
  routing_operation_id: string | null;
}

export interface CapacityRoutingOperation {
  id: string;
  name: string;
  work_center_id: string | null;
  setup_minutes: number;
  run_minutes_per_unit: number;
}

export interface CapacityWorkCenter {
  id: string;
  code: string | null;
  name: string;
  capacity_minutes_per_day: number;
  efficiency_pct: number;
}

export interface WorkCenterDailyLoad {
  workCenterId: string;
  workCenterCode: string;
  workCenterName: string;
  date: string;
  plannedMinutes: number;
  effectiveCapacityMinutes: number;
  utilizationPct: number | null;
  overCapacity: boolean;
  operationCount: number;
}

export interface CapacityPreview {
  dailyLoads: WorkCenterDailyLoad[];
  unscheduledMinutesByWorkCenter: Array<{
    workCenterId: string;
    workCenterCode: string;
    workCenterName: string;
    minutes: number;
    operationCount: number;
  }>;
  unassignedOperationCount: number;
  invalidOperationCount: number;
  activeOperationCount: number;
}

/**
 * Read-only capacity estimate. Only operations with both planned timestamps on
 * the same calendar date are allocated to a day. Multi-day and undated work is
 * kept in an unscheduled bucket instead of being spread using an invented rule.
 */
export function calculateCapacityPreview(
  operations: CapacityOperation[],
  routingOperations: CapacityRoutingOperation[],
  workCenters: CapacityWorkCenter[],
): CapacityPreview {
  const routingById = new Map(routingOperations.map((row) => [row.id, row]));
  const centerById = new Map(workCenters.map((row) => [row.id, row]));
  const daily = new Map<string, WorkCenterDailyLoad>();
  const unscheduled = new Map<string, { workCenterId: string; workCenterCode: string; workCenterName: string; minutes: number; operationCount: number }>();
  let unassignedOperationCount = 0;
  let invalidOperationCount = 0;

  for (const operation of operations) {
    const routing = operation.routing_operation_id ? routingById.get(operation.routing_operation_id) : undefined;
    const center = routing?.work_center_id ? centerById.get(routing.work_center_id) : undefined;
    if (!routing || !center) {
      unassignedOperationCount += 1;
      continue;
    }

    const quantity = Number(operation.planned_qty);
    const setupMinutes = Number(routing.setup_minutes);
    const runMinutesPerUnit = Number(routing.run_minutes_per_unit);
    if (![quantity, setupMinutes, runMinutesPerUnit].every(Number.isFinite) || quantity <= 0 || setupMinutes < 0 || runMinutesPerUnit < 0) {
      invalidOperationCount += 1;
      continue;
    }
    const plannedMinutes = setupMinutes + quantity * runMinutesPerUnit;
    if (!Number.isFinite(plannedMinutes) || plannedMinutes < 0) {
      invalidOperationCount += 1;
      continue;
    }

    const startDate = operation.planned_start?.slice(0, 10) ?? "";
    const endDate = operation.planned_end?.slice(0, 10) ?? "";
    if (startDate && endDate && startDate === endDate) {
      const key = `${center.id}|${startDate}`;
      const existing = daily.get(key);
      const effectiveCapacityMinutes = Math.max(0, Number(center.capacity_minutes_per_day) || 0) * Math.max(0, Number(center.efficiency_pct) || 0) / 100;
      if (existing) {
        existing.plannedMinutes += plannedMinutes;
        existing.operationCount += 1;
        existing.overCapacity = existing.effectiveCapacityMinutes > 0 && existing.plannedMinutes > existing.effectiveCapacityMinutes;
        existing.utilizationPct = existing.effectiveCapacityMinutes > 0 ? existing.plannedMinutes / existing.effectiveCapacityMinutes * 100 : null;
      } else {
        daily.set(key, {
          workCenterId: center.id,
          workCenterCode: center.code ?? "",
          workCenterName: center.name,
          date: startDate,
          plannedMinutes,
          effectiveCapacityMinutes,
          utilizationPct: effectiveCapacityMinutes > 0 ? plannedMinutes / effectiveCapacityMinutes * 100 : null,
          overCapacity: effectiveCapacityMinutes > 0 && plannedMinutes > effectiveCapacityMinutes,
          operationCount: 1,
        });
      }
    } else {
      const existing = unscheduled.get(center.id);
      if (existing) {
        existing.minutes += plannedMinutes;
        existing.operationCount += 1;
      } else {
        unscheduled.set(center.id, {
          workCenterId: center.id,
          workCenterCode: center.code ?? "",
          workCenterName: center.name,
          minutes: plannedMinutes,
          operationCount: 1,
        });
      }
    }
  }

  return {
    dailyLoads: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date) || a.workCenterName.localeCompare(b.workCenterName)),
    unscheduledMinutesByWorkCenter: [...unscheduled.values()].sort((a, b) => a.workCenterName.localeCompare(b.workCenterName)),
    unassignedOperationCount,
    invalidOperationCount,
    activeOperationCount: operations.length,
  };
}
