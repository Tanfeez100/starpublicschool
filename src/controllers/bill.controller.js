import { generateBillsPDF } from "../services/pdfGenerator.js";
import { createClient } from "@supabase/supabase-js";
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
export const generateBillsPDFController = async (req, res) => {
  try {
    const { month, class: className } = req.query;

    if (!month) {
      return res.status(400).json({
        message: "Month parameter is required (format: YYYY-MM)",
      });
    }

    // Validate month format (YYYY-MM)
    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM (e.g., 2024-01)",
      });
    }

    const year = parseInt(month.split('-')[0], 10);

    // Generate PDF (optionally restricted to a class)
    const pdfBuffer = await generateBillsPDF(month, className);

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bills-${month}.pdf"`
    );

    // Send PDF
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Generate bills for all students in all classes for a given month
 * POST /api/bills/generate-all
 * Body: { month: "YYYY-MM" }
 */
export const generateBillsForAll = async (req, res) => {
  try {
    const { month, include_exam_fee = false, include_annual_fee = false, include_computer_fee = false } = req.body;

    if (!month) {
      return res.status(400).json({
        message: "month is required",
      });
    }

    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM (e.g., 2024-01)",
      });
    }

    const year = parseInt(month.split('-')[0], 10);

    // Prevent generating or editing bills for a closed month
    const { data: closedRow } = await supabaseAdmin.from('month_closures').select('id').eq('month', month).maybeSingle();
    if (closedRow) return res.status(400).json({ message: `Bills for month ${month} are closed and cannot be created/edited` });

    const { data: students, error: studentsError } = await supabaseAdmin
      .from("students")
      .select("id, name, class, uses_transport, transport_charge");

    if (studentsError) {
      return res.status(500).json({
        message: "Failed to fetch students",
        error: studentsError.message,
      });
    }

    if (!students || students.length === 0) {
      return res.status(404).json({
        message: "No students found",
      });
    }

    const { data: feeStructures, error: fsError } = await supabaseAdmin
      .from("fee_structures")
      .select("*");

    if (fsError) {
      return res.status(500).json({
        message: "Failed to fetch fee structures",
        error: fsError.message,
      });
    }

    const feeStructureMap = {};
    feeStructures.forEach((fs) => {
      feeStructureMap[fs.class] = fs;
    });

    const feePromises = students.map(async (student) => {
      const feeStructure = feeStructureMap[student.class];

      if (!feeStructure) {
        return;
      }

      const tuitionFee = parseFloat(feeStructure.tuition_fee || 0);
      const examFee = parseFloat(feeStructure.exam_fee || 0);
      const annualFee = parseFloat(feeStructure.annual_fee || 0);
      const computerFee = parseFloat(feeStructure.computer_fee || 0);
      const transportFee = student.uses_transport && student.transport_charge ? parseFloat(student.transport_charge) : 0;

      const currentMonthFees = tuitionFee
        + (include_exam_fee ? examFee : 0)
        + (include_annual_fee ? annualFee : 0)
        + (include_computer_fee ? computerFee : 0)
        + transportFee;

      const totalFee = currentMonthFees;

      const { data: newBill } = await supabaseAdmin
        .from("fee_bills")
        .insert([{ student_id: student.id, month, year, total_amount: totalFee, bill_status: "DUE" }])
        .select()
        .maybeSingle();

      const billId = newBill.id;

      const items = [
        { bill_id: billId, fee_name: "Tuition Fee", amount: tuitionFee },
      ];
      if (include_exam_fee) items.push({ bill_id: billId, fee_name: "Exam Fee", amount: examFee });
      if (include_annual_fee) items.push({ bill_id: billId, fee_name: "Annual Fee", amount: annualFee });
      if (include_computer_fee) items.push({ bill_id: billId, fee_name: "Computer Fee", amount: computerFee });
      if (transportFee > 0) items.push({ bill_id: billId, fee_name: "Transport Fee", amount: transportFee });

      await supabaseAdmin.from("fee_bill_items").insert(items);
    });

    await Promise.all(feePromises);

    res.json({ message: "Bills generated successfully" });
  } catch (error) {
    console.error("Error generating bills:", error);
    res.status(500).json({
      message: "Failed to generate bills",
      error: error.message,
    });
  }
};

/**
 * Generate bills for all students in a class for a given month
 * POST /api/bills/generate
 * Body: { class: "Class Name", month: "YYYY-MM" }
 */
export const generateBillsForClass = async (req, res) => {
  try {
    const { class: className, month, include_exam_fee = false, include_annual_fee = false, include_computer_fee = false } = req.body;

    if (!className || !month) {
      return res.status(400).json({
        message: "class and month are required",
      });
    }

    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM (e.g., 2024-01)",
      });
    }

    const year = parseInt(month.split('-')[0], 10);

    // Prevent generating or editing bills for a closed month
    const { data: closedRow } = await supabaseAdmin.from('month_closures').select('id').eq('month', month).maybeSingle();
    if (closedRow) return res.status(400).json({ message: `Bills for month ${month} are closed and cannot be created/edited` });

    const { data: students, error: studentsError } = await supabaseAdmin
      .from("students")
      .select("id, class, uses_transport, transport_charge")
      .eq("class", className);

    if (studentsError) {
      return res.status(500).json({
        message: "Failed to fetch students",
        error: studentsError.message,
      });
    }

    if (!students || students.length === 0) {
      return res.status(404).json({
        message: "No students found in this class",
      });
    }

    // Fetch normalized fee_structure rows for the class (one row per fee type)
    const { data: feeRows, error: fsError } = await supabaseAdmin
      .from('fee_structures')
      .select('fee_name, fee_amount, period')
      .eq('class', className);

    if (fsError) {
      return res.status(500).json({ message: 'Failed to fetch fee structures', error: fsError.message });
    }
    if (!feeRows || feeRows.length === 0) {
      return res.status(404).json({ message: 'Fee structure not found for this class' });
    }

    // Derive component sums from normalized rows
    let tuitionFee = 0;
    let examFee = 0;
    let annualFee = 0;
    let computerFee = 0;
    feeRows.forEach(r => {
      const name = (r.fee_name || '').toLowerCase();
      const amt = parseFloat(r.fee_amount || 0) || 0;
      if (name.includes('tuition')) tuitionFee += amt;
      else if (name.includes('exam')) examFee += amt;
      else if (name.includes('annual')) annualFee += amt;
      else if (name.includes('computer')) computerFee += amt;
    });

    const { data: activeAdvRows } = await supabaseAdmin
      .from("advance_ledger")
      .select("student_id, amount")
      .in("student_id", students.map(s => s.id))
      .eq("status", "active");

    const advancesMap = {};
    if (activeAdvRows && activeAdvRows.length > 0) {
      activeAdvRows.forEach(a => {
        const sid = a.student_id;
        advancesMap[sid] = (advancesMap[sid] || 0) + (parseFloat(a.amount) || 0);
      });
    }

    // Pre-fetch existing bills/payments for this class & month so individual loop doesn't re-query
    const { data: existingBills } = await supabaseAdmin.from('fee_bills').select('id, student_id, total_amount').in('student_id', students.map(s => s.id)).eq('month', month);
    const billsMap = {};
    (existingBills || []).forEach(b => { billsMap[b.student_id] = b; });

    const billIds = (existingBills || []).map(b => b.id);
    const { data: paymentsRows } = await supabase.from('fee_payments').select('bill_id, amount_paid').in('bill_id', billIds || []);
    const paymentsMap = {};
    (paymentsRows || []).forEach(p => { paymentsMap[p.bill_id] = (paymentsMap[p.bill_id] || 0) + (parseFloat(p.amount_paid || 0)); });

    const feePromises = students.map(async (student) => {
      try {
        // Calculate previous due
        const previousDue = await calculatePreviousDue(student.id, month);
        
        // Calculate transport fee if student uses transport
        const transportFee = student.uses_transport && student.transport_charge 
          ? parseFloat(student.transport_charge) 
          : 0;

        // Calculate total fee using include flags
        console.log(`Generating bill for student ${student.id} (class ${className}) - flags: include_exam_fee=${include_exam_fee}, include_annual_fee=${include_annual_fee}, include_computer_fee=${include_computer_fee}`);
        const currentMonthFees = tuitionFee
          + (include_exam_fee ? examFee : 0)
          + (include_annual_fee ? annualFee : 0)
          + (include_computer_fee ? computerFee : 0)
          + transportFee;
        const totalFee = currentMonthFees + previousDue;

        // Prefer `fee_bills` for current bill state
        const existingBill = billsMap[student.id] || null;
        let billId;

        if (existingBill) {
          billId = existingBill.id;
          const { error: updateError } = await supabase
            .from('fee_bills')
            .update({ total_amount: totalFee, year, updated_at: new Date().toISOString() })
            .eq('id', billId);

          if (updateError) {
            errorCount++;
            errors.push(`Failed to update bill for ${student.name}: ${updateError.message}`);
            return;
          }

          // Remove old items
          await supabase.from('fee_bill_items').delete().eq('bill_id', billId);
        } else {
          const { data: newBill, error: createError } = await supabase
            .from('fee_bills')
            .insert([{ student_id: student.id, month, year, total_amount: totalFee, bill_status: 'unpaid' }])
            .select()
            .maybeSingle();

          if (createError) {
            // Handle unique-violation races gracefully by fetching the existing bill
            console.warn(`create bill error for ${student.id}:`, createError.message);
            const { data: existing, error: fetchErr } = await supabase
              .from('fee_bills')
              .select('id')
              .eq('student_id', student.id)
              .eq('month', month)
              .single();
            if (fetchErr || !existing) {
              errorCount++;
              errors.push(`Failed to create or find bill for ${student.name}: ${createError.message}`);
              return;
            }

            billId = existing.id;
          } else {
            billId = newBill.id;
          }
        }

        // Auto-application of advances during bill generation has been removed.
        // Advances must be applied explicitly via payments (payment_mode = 'advance_adjustment') or admin adjustments.
        // (availableAdvance / remainingDue calculations intentionally omitted)



        // Prepare bill items and insert
        const billItems = [];
        billItems.push({ bill_id: billId, fee_name: 'Tuition Fee', amount: tuitionFee });
        if (include_exam_fee) billItems.push({ bill_id: billId, fee_name: 'Exam Fee', amount: examFee });
        if (include_annual_fee) billItems.push({ bill_id: billId, fee_name: 'Annual Fee', amount: annualFee });
        if (include_computer_fee) billItems.push({ bill_id: billId, fee_name: 'Computer Fee', amount: computerFee });
        if (transportFee > 0) billItems.push({ bill_id: billId, fee_name: 'Transport Fee', amount: transportFee });
        if (previousDue > 0) billItems.push({ bill_id: billId, fee_name: 'Previous Due', amount: previousDue });

        const { error: itemsError } = await supabase.from('fee_bill_items').insert(billItems);
        if (itemsError) {
          errorCount++;
          errors.push(`Failed to create bill items for ${student.name}: ${itemsError.message}`);
          return;
        }

        // (advance ledger insertion already handled earlier); proceed to synthetic payment insertion if advanceUsed > 0
        
// Synthetic payment only if advance was actually used
if (false && advanceUsed > 0) {

  const paymentInsert = {
    student_id: student.id,
    bill_id: billId,
    amount_paid: advanceUsed,
    payment_mode: "advance_adjustment",
    payment_date: new Date().toISOString().split("T")[0],
  };

  const { error: payErr } = await supabaseAdmin
    .from("fee_payments")
    .insert([paymentInsert]);

  if (payErr) {
    console.error(
      `Failed to insert synthetic fee_payment for student ${student.id}:`,
      payErr
    );
  }

  // ✅ Update bill status after advance adjustment
  const existingPaid = paymentsMap[billId] || 0;
  const totalPaidNow = existingPaid + advanceUsed;

  const newStatus =
    totalPaidNow >= totalFee
      ? "paid"
      : totalPaidNow > 0
      ? "partial"
      : "unpaid";

  await supabaseAdmin
    .from("fee_bills")
    .update({ bill_status: newStatus })
    .eq("id", billId);

  // ✅ Update local maps skipped — advances are NOT auto-applied during bill generation
  paymentsMap[billId] = totalPaidNow;
}


            // advances map update skipped — no auto-advance application

        return { success: true, student_id: student.id };
      } catch (error) {
        console.error(`Error processing student ${student.id}:`, error);
        return { success: false, student_id: student.id, error: error.message };
      }
    });

    // Execute all fee generation promises
    const results = await Promise.all(feePromises);
    
    // Count successes and errors
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    results.forEach((result) => {
      if (result?.success) {
        successCount++;
      } else {
        errorCount++;
        errors.push(`Failed for student ${result?.student_id}: ${result?.error || "Unknown error"}`);
      }
    });

    res.json({
      message: `Bills generated for ${successCount} students in class ${className}`,
      month,
      totalStudents: students.length,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error generating bills:", error);
    res.status(500).json({
      message: "Failed to generate bills",
      error: error.message,
    });
  }
};

