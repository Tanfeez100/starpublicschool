import { generateBillsPDF } from "../services/pdfGenerator.js";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../services/supabase.js";
import { calculatePreviousDue } from "../utils/feeHelper.js";
// Admin client for bill operations (uses service role key to bypass RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Generate PDF with all bills for a given month
 * GET /api/bills/pdf?month=YYYY-MM
 */
export const getBillsDownloadData = async (req, res) => {
  try {
    const { month, class: className } = req.query;

    if (!month) {
      return res.status(400).json({
        message: "Month is required (YYYY-MM)",
      });
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM",
      });
    }

    // 🔎 Fetch Bills + Student
    let query = supabase
      .from("fee_bills")
      .select(`
        id,
        student_id,
        month,
        total_amount,
        net_payable,
        bill_status,
        students (
          name,
          roll_no,
          class,
          uses_transport,
          transport_charge
        )
      `)
      .eq("month", month);

    if (className) {
      query = query.eq("students.class", className);
    }

    const { data: bills, error } = await query;

    if (error) {
      return res.status(500).json({
        message: "Failed to fetch bills",
        error: error.message,
      });
    }

    if (!bills?.length) {
      return res.status(404).json({
        message: "No bills found for this month",
      });
    }

    const formattedBills = [];

    for (const bill of bills) {

      // 📦 Bill Items
      const { data: items } = await supabase
        .from("fee_bill_items")
        .select("fee_name, amount")
        .eq("bill_id", bill.id);

      // 💰 Advance Used For This Bill (if any)
      // Query from advance_ledger where this bill was the target
      const { data: advanceUsedRows } = await supabase
        .from("advance_ledger")
        .select("amount")
        .eq("used_for_bill_id", bill.id)
        .in("status", ["used"]);

      const advanceUsed =
        advanceUsedRows?.reduce(
          (sum, a) => sum + parseFloat(a.amount || 0),
          0
        ) || 0;

      // 🚍 Ensure transport is shown even if not inserted as item
      let finalItems = items || [];

      const hasTransportItem = finalItems.some(i =>
        i.fee_name.toLowerCase().includes("transport")
      );

      if (
        bill.students.uses_transport &&
        bill.students.transport_charge &&
        !hasTransportItem
      ) {
        finalItems.push({
          fee_name: "Transport Fee",
          amount: bill.students.transport_charge,
        });
      }

      formattedBills.push({
        bill_id: bill.id,
        student: bill.students,
        month: bill.month,
        items: finalItems,
        summary: {
          total_amount: parseFloat(bill.total_amount || 0),
          advance_used: advanceUsed,
          net_payable: parseFloat(bill.net_payable || 0),
          status: bill.bill_status,
        },
      });
    }

    return res.json({
      month,
      class: className || "All",
      totalBills: formattedBills.length,
      bills: formattedBills,
    });

  } catch (error) {
    console.error("Download data error:", error);
    return res.status(500).json({
      message: "Failed to fetch download data",
      error: error.message,
    });
  }
};



/**
 * Generate bills for all students in all classes for a given month
 * POST /api/bills/generate-all
 * Body: { month: "YYYY-MM" }
 */


/**
 * Generate bills for all students in a class for a given month
 * POST /api/bills/generate
 * Body: { class: "Class Name", month: "YYYY-MM" }
 */
export const generateBillsForClass = async (req, res) => {
  try {
    const {
      class: className,
      month,
      include_exam_fee = false,
      include_annual_fee = false,
      include_computer_fee = false,
    } = req.body;

    if (!className || !month) {
      return res.status(400).json({ message: "class and month are required" });
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "Invalid month format. Use YYYY-MM" });
    }

    const year = parseInt(month.split("-")[0], 10);

    // 🔒 Prevent generation for closed month
    const { data: closedRow } = await supabaseAdmin
      .from("month_closures")
      .select("id")
      .eq("month", month)
      .maybeSingle();

    if (closedRow) {
      return res.status(400).json({ message: `Month ${month} is closed` });
    }

    // 👨‍🎓 Fetch students
    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, uses_transport, transport_charge")
      .eq("class", className);

    if (!students?.length) {
      return res.status(404).json({ message: "No students found" });
    }

    // 💰 Fee structure
    const { data: feeRows } = await supabaseAdmin
      .from("fee_structures")
      .select("fee_name, fee_amount")
      .eq("class", className);

    let tuition = 0,
      exam = 0,
      annual = 0,
      computer = 0;

    feeRows?.forEach((r) => {
      const name = (r.fee_name || "").toLowerCase();
      const amt = parseFloat(r.fee_amount || 0);

      if (name.includes("tuition")) tuition += amt;
      else if (name.includes("exam")) exam += amt;
      else if (name.includes("annual")) annual += amt;
      else if (name.includes("computer")) computer += amt;
    });

    const results = await Promise.all(
      students.map(async (student) => {
        try {
          // 🔁 Get pending previous dues
          const { data: duesRows } = await supabaseAdmin
            .from("previous_dues")
            .select("id, remaining_due")
            .eq("student_id", student.id)
            .eq("status", "pending")
            .lt("month", month);

          const previousDue =
            duesRows?.reduce(
              (sum, d) => sum + parseFloat(d.remaining_due || 0),
              0
            ) || 0;

          // 🚍 Transport
          const transport =
            student.uses_transport && student.transport_charge
              ? parseFloat(student.transport_charge)
              : 0;

          const baseFee =
            tuition +
            (include_exam_fee ? exam : 0) +
            (include_annual_fee ? annual : 0) +
            (include_computer_fee ? computer : 0) +
            transport;

          const totalAmount = baseFee + previousDue;

          // 🔎 Check existing bill first
          const { data: existingBill } = await supabaseAdmin
            .from("fee_bills")
            .select("id")
            .eq("student_id", student.id)
            .eq("month", month)
            .maybeSingle();

          let billId;

          if (existingBill) {
            billId = existingBill.id;

            await supabaseAdmin
              .from("fee_bill_items")
              .delete()
              .eq("bill_id", billId);
          } else {
            const { data: newBill } = await supabaseAdmin
              .from("fee_bills")
              .insert([
                {
                  student_id: student.id,
                  month,
                  year,
                  total_amount: totalAmount,
                  net_payable: totalAmount,
                  bill_status: "unpaid",
                },
              ])
              .select()
              .single();

            billId = newBill.id;
          }

          // 🔥 APPLY ADVANCE FIFO
          const { data: advanceRows } = await supabaseAdmin
            .from("advance_ledger")
            .select("id, amount")
            .eq("student_id", student.id)
            .eq("status", "active")
            .order("created_at", { ascending: true });

          let remainingToAdjust = totalAmount;
          let totalAdvanceUsed = 0;
          const usedAdvanceIds = [];
          const partiallyUsedAdvances = [];

          if (advanceRows?.length) {
            for (const adv of advanceRows) {
              if (remainingToAdjust <= 0) break;

              const advAmount = parseFloat(adv.amount || 0);
              const useAmount = Math.min(advAmount, remainingToAdjust);

              totalAdvanceUsed += useAmount;
              remainingToAdjust -= useAmount;
              usedAdvanceIds.push(adv.id);

              if (useAmount === advAmount) {
                // fully consumed - set status to used
                await supabaseAdmin
                  .from("advance_ledger")
                  .update({
                    status: "used",
                    used_for_bill_id: billId,
                    used_at: new Date().toISOString(),
                  })
                  .eq("id", adv.id);
              } else {
                // 🟡 partial consume - track it and keep as active with reduced amount
                partiallyUsedAdvances.push({
                  advance_id: adv.id,
                  used_amount: useAmount,
                  remaining_amount: advAmount - useAmount,
                  bill_id: billId
                });

                await supabaseAdmin
                  .from("advance_ledger")
                  .update({
                    amount: advAmount - useAmount,
                    used_for_bill_id: billId, // 🔑 Track which bill partially used this
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", adv.id);
              }
            }
          }

          const netPayable = Math.max(0, remainingToAdjust);

          const status =
            netPayable === 0
              ? "paid"
              : totalAdvanceUsed > 0
              ? "partial"
              : "unpaid";

          await supabaseAdmin
            .from("fee_bills")
            .update({
              total_amount: totalAmount,
              net_payable: netPayable,
              bill_status: status,
              updated_at: new Date().toISOString(),
            })
            .eq("id", billId);

          // 🧾 Insert bill items
          const items = [
            { bill_id: billId, fee_name: "Tuition Fee", amount: tuition },
          ];

          if (include_exam_fee)
            items.push({ bill_id: billId, fee_name: "Exam Fee", amount: exam });

          if (include_annual_fee)
            items.push({ bill_id: billId, fee_name: "Annual Fee", amount: annual });

          if (include_computer_fee)
            items.push({ bill_id: billId, fee_name: "Computer Fee", amount: computer });

          if (transport > 0)
            items.push({ bill_id: billId, fee_name: "Transport Fee", amount: transport });

          if (previousDue > 0)
            items.push({ bill_id: billId, fee_name: "Previous Due", amount: previousDue });

          if (totalAdvanceUsed > 0)
            items.push({
              bill_id: billId,
              fee_name: "Advance Adjustment",
              amount: -totalAdvanceUsed,
            });

          await supabaseAdmin.from("fee_bill_items").insert(items);

          // 🔥 Mark dues as rolled
          if (duesRows?.length) {
            await supabaseAdmin
              .from("previous_dues")
              .update({
                status: "rolled",
                to_month: month,
                updated_at: new Date().toISOString(),
              })
              .in("id", duesRows.map((d) => d.id));
          }

          return { success: true };
        } catch (err) {
          return { success: false, error: err.message };
        }
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const errorCount = results.length - successCount;

    return res.json({
      message: `Bills generated for ${successCount} students`,
      month,
      successCount,
      errorCount,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to generate bills",
      error: error.message,
    });
  }
};




