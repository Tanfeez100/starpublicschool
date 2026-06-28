import { generateBillsPDF } from "../services/pdfGenerator.js";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../services/supabase.js";
import { calculatePreviousDue } from "../utils/feeHelper.js";

const normalizeClassToken = (value) => {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.toLowerCase() === "mother care" ? "Nursery" : text;
};

const buildClassVariants = (value) => {
  const normalized = normalizeClassToken(value);
  if (!normalized) return [];
  return normalized === "Nursery" ? ["Nursery", "Mother Care"] : [normalized];
};
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
      return res.status(400).json({ message: "Month is required (YYYY-MM)" });
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "Invalid month format. Use YYYY-MM" });
    }

    const classVariants = buildClassVariants(className);

    // ✅ STEP 1: Fetch ONLY active student IDs (exclude inactive/left students)
    let studentQuery = supabaseAdmin
      .from("students")
      .select("id, name, father_name, section, roll_no, class, uses_transport, transport_charge, status")
      .eq("status", "active"); // Only active students

    if (className) {
      studentQuery = studentQuery.in("class", classVariants);
    }

    const { data: activeStudents, error: studentError } = await studentQuery;

    if (studentError) {
      return res.status(500).json({
        message: "Failed to fetch active students",
        error: studentError.message,
      });
    }

    if (!activeStudents?.length) {
      const msg = className
        ? `No active students found in class ${className}. All students may have left.`
        : "No active students found.";
      return res.status(404).json({ message: msg, month, class: className || "All", totalBills: 0, bills: [] });
    }

    const activeStudentIds = activeStudents.map(s => s.id);

    // Build a quick lookup map for student details
    const studentMap = {};
    activeStudents.forEach(s => { studentMap[s.id] = s; });

    // ✅ STEP 2: Fetch bills ONLY for active students
    const { data: bills, error: billError } = await supabaseAdmin
      .from("fee_bills")
      .select("id, student_id, month, total_amount, net_payable, bill_status, receipt_number")
      .eq("month", month)
      .in("student_id", activeStudentIds); // Only bills for active students

    if (billError) {
      return res.status(500).json({ message: "Failed to fetch bills", error: billError.message });
    }

    if (!bills?.length) {
      const msg = className
        ? `No bills found for class ${className} in ${month}.`
        : `No bills found for ${month}.`;
      return res.status(404).json({ message: msg, month, class: className || "All", totalBills: 0, bills: [] });
    }

    // ✅ STEP 3: Format each bill safely
    const formattedBills = [];

    for (const bill of bills) {
      // Get student data from our map (guaranteed active)
      const student = studentMap[bill.student_id];

      // Skip if student not found in active map (safety check)
      if (!student) {
        console.log(`Skipping bill ${bill.id} - student ${bill.student_id} not in active list`);
        continue;
      }

      // 📦 Bill Items
      const { data: items } = await supabaseAdmin
        .from("fee_bill_items")
        .select("fee_name, amount")
        .eq("bill_id", bill.id);

      // 💰 Advance Used For This Bill
      const { data: advanceUsedRows } = await supabaseAdmin
        .from("advance_ledger")
        .select("amount")
        .eq("used_for_bill_id", bill.id)
        .in("status", ["used"]);

      const advanceUsed = advanceUsedRows?.reduce((sum, a) => sum + parseFloat(a.amount || 0), 0) || 0;

      // 🚍 Transport fee check
      let finalItems = items || [];
      const hasTransportItem = finalItems.some(i => (i.fee_name || "").toLowerCase().includes("transport"));

      if (student.uses_transport && student.transport_charge && !hasTransportItem) {
        finalItems.push({ fee_name: "Transport Fee", amount: student.transport_charge });
      }

      formattedBills.push({
        bill_id: bill.id,
        student: {
          name: student.name || null,
          class: student.class || null,
          roll_no: student.roll_no || null,
          section: student.section || null,
          father_name: student.father_name || null,
          uses_transport: student.uses_transport || false,
          transport_charge: student.transport_charge || null,
        },
        month: bill.month,
        items: finalItems,
        summary: {
          total_amount: parseFloat(bill.total_amount || 0),
          advance_used: advanceUsed,
          net_payable: Math.max(0, parseFloat(bill.total_amount || 0) - advanceUsed),
          status: bill.bill_status,
        },
        receipt_number: bill.receipt_number || null,
      });
    }

    if (!formattedBills.length) {
      const msg = className
        ? `No bills found for active students in class ${className} for ${month}.`
        : `No bills found for active students in ${month}.`;
      return res.status(404).json({ message: msg, month, class: className || "All", totalBills: 0, bills: [] });
    }

    return res.json({
      month,
      class: className || "All",
      totalBills: formattedBills.length,
      bills: formattedBills,
    });

  } catch (error) {
    console.error("Download data error:", error);
    return res.status(500).json({ message: "Failed to fetch download data", error: error.message });
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
 * 
 * options.migrationStudentData: Map<student_id, pending_due> - for migration month bills
 */
export const createBillsForClass = async (className, month, section = null, options = {}) => {
  const {
    include_exam_fee = true,
    include_annual_fee = true,
    include_computer_fee = true,
    migrationStudentData = null, // Map of student_id -> pending_due for migration
  } = options;

  if (!className || !month) {
    throw new Error("class and month are required");
  }

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Invalid month format. Use YYYY-MM");
  }

  const year = parseInt(month.split("-")[0], 10);
  const classVariants = buildClassVariants(className);

  // 🔒 Prevent generation for closed month
  const { data: closedRow } = await supabaseAdmin
    .from("month_closures")
    .select("id")
    .eq("month", month)
    .maybeSingle();

  if (closedRow) {
    throw new Error(`Month ${month} is closed`);
  }

  // 👨‍🎓 Fetch ONLY ACTIVE students (exclude inactive/left students)
  let studentQuery = supabaseAdmin
    .from("students")
    .select("id, uses_transport, transport_charge, section")
    .in("class", classVariants)
    .eq("status", "active");

  if (section) {
    studentQuery = studentQuery.eq("section", section);
  }

  const { data: students } = await studentQuery;

  if (!students?.length) {
    return { successCount: 0, errorCount: 0, message: `No active students found in class ${className}${section ? ' section ' + section : ''}.` };
  }

  // 💰 Fee structure
  const { data: feeRows } = await supabaseAdmin
    .from("fee_structures")
    .select("fee_name, fee_amount")
    .in("class", classVariants);

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
        let previousDue = 0;
        let duesRows = [];

        // ✅ During migration: Use migrationStudentData directly (don't query previous_dues)
        if (migrationStudentData && migrationStudentData.has(student.id)) {
          previousDue = migrationStudentData.get(student.id);
        } else {
          // Regular month: Query previous_dues table as normal
          const { data: rows } = await supabaseAdmin
            .from("previous_dues")
            .select("id, remaining_due")
            .eq("student_id", student.id)
            .eq("status", "pending")
            .lt("month", month);

          duesRows = rows || [];
          previousDue = duesRows?.reduce((sum, d) => sum + parseFloat(d.remaining_due || 0), 0) || 0;
        }

        // ✅ Exclude transport during migration month
        const transport =
          !migrationStudentData && student.uses_transport && student.transport_charge
            ? parseFloat(student.transport_charge)
            : 0;

        // ✅ During migration: NO regular fees (only show migrated amount)
        // Regular months: Show all fees
        const baseFee =
          migrationStudentData
            ? 0 // Migration month: no fees, only migrated pending due
            : tuition +
              (include_exam_fee ? exam : 0) +
              (include_annual_fee ? annual : 0) +
              (include_computer_fee ? computer : 0) +
              transport;

        const totalAmount = baseFee + previousDue;

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
          const [yearPart, monthPart] = month.split("-");
          const { data: receiptData, error: receiptError } =
            await supabase.rpc("generate_receipt_number", {
              p_year: parseInt(yearPart),
              p_month: parseInt(monthPart),
            });

          if (receiptError) throw receiptError;

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
                receipt_number: receiptData,
              },
            ])
            .select()
            .single();

          billId = newBill.id;
        }

        const { data: advanceRows } = await supabaseAdmin
          .from("advance_ledger")
          .select("id, amount")
          .eq("student_id", student.id)
          .eq("status", "active")
          .order("created_at", { ascending: true });

        let remainingToAdjust = totalAmount;
        let totalAdvanceUsed = 0;

        if (advanceRows?.length) {
          for (const adv of advanceRows) {
            if (remainingToAdjust <= 0) break;

            const advAmount = parseFloat(adv.amount || 0);
            const useAmount = Math.min(advAmount, remainingToAdjust);

            totalAdvanceUsed += useAmount;
            remainingToAdjust -= useAmount;

            if (useAmount === advAmount) {
              await supabaseAdmin
                .from("advance_ledger")
                .update({
                  status: "used",
                  used_for_bill_id: billId,
                  used_at: new Date().toISOString(),
                })
                .eq("id", adv.id);
            } else {
              await supabaseAdmin
                .from("advance_ledger")
                .update({
                  amount: advAmount - useAmount,
                  used_for_bill_id: billId,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", adv.id);
            }
          }
        }

        const finalNetPayable = remainingToAdjust;
        const finalStatus =
          finalNetPayable === 0
            ? "paid"
            : finalNetPayable < totalAmount
            ? "partial"
            : "unpaid";

        await supabaseAdmin
          .from("fee_bills")
          .update({
            total_amount: totalAmount,
            net_payable: finalNetPayable,
            advance_used: totalAdvanceUsed,
            bill_status: finalStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", billId);

        const standardizedItems = migrationStudentData
          ? [
              // Migration month: ONLY show migrated pending due
              { fee_name: "Previous Due", amount: previousDue },
            ]
          : [
              // Regular months: Show all fees
              { fee_name: "Tuition Fee", amount: tuition },
              { fee_name: "Exam Fee", amount: include_exam_fee ? exam : 0 },
              { fee_name: "Annual Fee", amount: include_annual_fee ? annual : 0 },
              { fee_name: "Computer Fee", amount: include_computer_fee ? computer : 0 },
              { fee_name: "Transport Fee", amount: transport },
              { fee_name: "Previous Due", amount: previousDue },
            ];

        await supabaseAdmin.from("fee_bill_items").insert(
          standardizedItems.map((item) => ({
            bill_id: billId,
            fee_name: item.fee_name,
            amount: item.amount,
          }))
        );

        // ✅ Only update previous_dues status in NON-MIGRATION months
        // During migration, previous_dues table is not used at all
        if (duesRows?.length && !migrationStudentData) {
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

  return { successCount, errorCount, total: results.length };
};

export const generateBillsForClass = async (req, res) => {
  try {
    const {
      class: className,
      month,
      section,
      include_exam_fee = true,
      include_annual_fee = true,
      include_computer_fee = true,
    } = req.body;

    const summary = await createBillsForClass(className, month, section, {
      include_exam_fee,
      include_annual_fee,
      include_computer_fee,
    });

    return res.json({
      message: `Bills generated for ${summary.successCount} students`,
      month,
      ...summary,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to generate bills",
      error: error.message,
    });
  }
};








