import type { StatusOption } from "@/components/status-pill";

export const BILL_STATUS_OPTIONS: StatusOption[] = [
  { value: "approved",       label: "Approved",     className: "bg-green-50   text-green-700   ring-green-600/20"   },
  { value: "pending_review", label: "Needs Review", className: "bg-amber-50   text-amber-700   ring-amber-600/20"   },
  { value: "hard_rejected",  label: "Rejected",     className: "bg-red-50     text-red-700     ring-red-600/20"     },
  { value: "received",       label: "Received",     className: "bg-zinc-100   text-zinc-600    ring-zinc-500/20"    },
  { value: "expected",       label: "Expected",     className: "bg-blue-50    text-blue-700    ring-blue-600/20"    },
  { value: "queried",        label: "Queried",      className: "bg-orange-50  text-orange-700  ring-orange-600/20"  },
  { value: "reviewed",       label: "Reviewed",     className: "bg-indigo-50  text-indigo-700  ring-indigo-600/20"  },
  { value: "paid",           label: "Paid",         className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  { value: "overdue",        label: "Overdue",      className: "bg-red-50     text-red-800     ring-red-700/20"     },
  { value: "not_applicable", label: "N/A",          className: "bg-zinc-50    text-zinc-400    ring-zinc-400/20"    },
];

export const PROPERTY_STATUS_OPTIONS: StatusOption[] = [
  { value: "active",   label: "Active",   className: "bg-green-50 text-green-700 ring-green-600/20" },
  { value: "inactive", label: "Inactive", className: "bg-zinc-100 text-zinc-500  ring-zinc-400/20"  },
  { value: "sold",     label: "Sold",     className: "bg-zinc-100 text-zinc-400  ring-zinc-300/20"  },
];
