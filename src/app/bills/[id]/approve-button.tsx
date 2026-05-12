"use client";

import { useTransition } from "react";
import { approveBill } from "./actions";

export function ApproveButton({ billId }: { billId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => approveBill(billId))}
      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-500 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {isPending ? "Approving…" : "Approve Bill"}
    </button>
  );
}
