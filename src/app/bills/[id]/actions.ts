"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Approve a bill: set status → approved, write audit log, revalidate pages.
 * Called from the ApproveButton client component via a server action.
 */
export async function approveBill(billId: string): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error: updateError } = await supabase
    .from("bills")
    .update({ status: "approved" })
    .eq("id", billId);

  if (updateError) {
    throw new Error(`Failed to approve bill: ${updateError.message}`);
  }

  await supabase.from("audit_log").insert({
    entity_type: "bill",
    entity_id: billId,
    action: "approved",
    user_identifier: "admin",
    notes: "Manually approved via review panel",
  });

  revalidatePath(`/bills/${billId}`);
  revalidatePath("/bills");
}
