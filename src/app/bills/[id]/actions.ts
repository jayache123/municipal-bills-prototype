"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Approve a bill: set status → approved, write audit log, revalidate pages.
 * Called from the ApproveButton client component via a server action.
 */
export async function approveBill(billId: string): Promise<void> {
  await updateBillStatus(billId, "approved");
}

/**
 * Update a bill's status to any valid value.
 * Writes an audit log entry and revalidates all affected pages.
 */
export async function updateBillStatus(billId: string, status: string): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error: updateError } = await supabase
    .from("bills")
    .update({ status })
    .eq("id", billId);

  if (updateError) {
    throw new Error(`Failed to update bill status: ${updateError.message}`);
  }

  await supabase.from("audit_log").insert({
    entity_type: "bill",
    entity_id: billId,
    action: `status_changed_to_${status}`,
    user_identifier: "admin",
    notes: `Status changed to "${status}" via review panel`,
  });

  revalidatePath(`/bills/${billId}`);
  revalidatePath("/bills");
  revalidatePath("/");
}
