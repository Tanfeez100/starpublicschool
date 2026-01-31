import { supabase } from "../services/supabase.js";
import { getFinancialYear } from "./finance.js";

export async function generateInvoiceNumber() {
  const fy = getFinancialYear();

  // 1️⃣ Fetch or create FY row
  let { data, error } = await supabase
    .from("invoice_counters")
    .select("*")
    .eq("financial_year", fy)
    .single();

  if (!data) {
    const { data: created } = await supabase
      .from("invoice_counters")
      .insert({
        financial_year: fy,
        last_number: 0,
      })
      .select()
      .single();

    data = created;
  }

  // 2️⃣ Increment
  const next = data.last_number + 1;

  // 3️⃣ Update counter
  await supabase
    .from("invoice_counters")
    .update({
      last_number: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  // 4️⃣ Final invoice no
  const invoiceNo = `GPS/${fy}/${String(next).padStart(6, "0")}`;

  return invoiceNo;
}
