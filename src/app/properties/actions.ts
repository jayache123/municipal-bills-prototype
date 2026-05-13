"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Update a property's status to any valid value (active | inactive | sold).
 * Writes an audit log entry and revalidates all affected pages.
 */
export async function updatePropertyStatus(propertyId: string, status: string): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error: updateError } = await supabase
    .from("properties")
    .update({ status })
    .eq("id", propertyId);

  if (updateError) {
    throw new Error(`Failed to update property status: ${updateError.message}`);
  }

  await supabase.from("audit_log").insert({
    entity_type: "property",
    entity_id: propertyId,
    action: `status_changed_to_${status}`,
    user_identifier: "admin",
    notes: `Status changed to "${status}" via property panel`,
  });

  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
  revalidatePath("/");
}
