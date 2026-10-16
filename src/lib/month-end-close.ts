/**
 * Month-end / period-close checklist for Tally-replacement readiness.
 * This is a controlled workflow model — actual period lock remains a server/admin operation.
 */

export type CloseTaskStatus = "pending" | "done" | "blocked" | "na";

export type CloseTask = {
  id: string;
  title: string;
  description: string;
  ownerRole: "accountant" | "admin" | "production" | "hr" | "sales";
  status: CloseTaskStatus;
  blockerReason?: string;
};

export type CloseChecklist = {
  periodLabel: string;
  tasks: CloseTask[];
  completionRatio: number;
  readyToClose: boolean;
  openBlockers: string[];
};

const DEFAULT_TASK_DEFS: Array<Omit<CloseTask, "status" | "blockerReason">> = [
  {
    id: "bank-reconcile",
    title: "Bank reconciliation complete",
    description: "All company bank accounts reconciled for the period with no unexplained difference.",
    ownerRole: "accountant",
  },
  {
    id: "ar-review",
    title: "Receivables ageing reviewed",
    description: "AR ageing reviewed; disputed or unallocated receipts noted.",
    ownerRole: "accountant",
  },
  {
    id: "ap-review",
    title: "Payables ageing reviewed",
    description: "AP ageing reviewed; holds and debit notes recorded.",
    ownerRole: "accountant",
  },
  {
    id: "stock-valuation",
    title: "Stock valuation tied out",
    description: "Stock ledger valuation agrees to inventory reports; unvalued opening stock classified.",
    ownerRole: "accountant",
  },
  {
    id: "production-wip",
    title: "Production WIP / FG receipts posted",
    description: "Open production consumption and finished-goods receipts for the period are posted.",
    ownerRole: "production",
  },
  {
    id: "gst-returns",
    title: "GST summaries prepared",
    description: "Outward/inward GST summaries prepared for return filing.",
    ownerRole: "accountant",
  },
  {
    id: "payroll",
    title: "Payroll posted",
    description: "Attendance locked and payroll/payslips posted for the period.",
    ownerRole: "hr",
  },
  {
    id: "trial-balance",
    title: "Trial balance reviewed",
    description: "Trial balance reviewed; suspense and temporary accounts cleared or explained.",
    ownerRole: "accountant",
  },
  {
    id: "backup",
    title: "Recoverable backup verified",
    description: "Period-end backup / snapshot verified restorable before period lock.",
    ownerRole: "admin",
  },
];

export function createMonthEndChecklist(periodLabel: string, overrides: Partial<Record<string, CloseTaskStatus>> = {}): CloseChecklist {
  const tasks: CloseTask[] = DEFAULT_TASK_DEFS.map((def) => ({
    ...def,
    status: overrides[def.id] ?? "pending",
  }));
  return evaluateCloseChecklist(periodLabel, tasks);
}

export function evaluateCloseChecklist(periodLabel: string, tasks: CloseTask[]): CloseChecklist {
  const actionable = tasks.filter((t) => t.status !== "na");
  const done = actionable.filter((t) => t.status === "done").length;
  const completionRatio = actionable.length ? done / actionable.length : 1;
  const openBlockers = tasks
    .filter((t) => t.status === "blocked")
    .map((t) => t.blockerReason || t.title);
  const readyToClose =
    actionable.every((t) => t.status === "done") && openBlockers.length === 0;
  return { periodLabel, tasks, completionRatio, readyToClose, openBlockers };
}

export function setCloseTaskStatus(
  checklist: CloseChecklist,
  taskId: string,
  status: CloseTaskStatus,
  blockerReason?: string,
): CloseChecklist {
  const tasks = checklist.tasks.map((task) =>
    task.id === taskId
      ? { ...task, status, blockerReason: status === "blocked" ? blockerReason || task.title : undefined }
      : task,
  );
  return evaluateCloseChecklist(checklist.periodLabel, tasks);
}
