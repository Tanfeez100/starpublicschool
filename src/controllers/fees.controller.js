import { supabase } from "../services/supabase.js";
import { getDues, getTotalPaid, getTotalFee, calculateAdvance } from "../utils/feeHelper.js";

/**
 * Close a month - handle dues for unpaid fees
 * POST /api/fees/close-month
 * Body: { month: "YYYY-MM" }
 */
export const closeMonth = async (req, res) => {
  try {
    const { month } = req.body;

    if (!month) return res.status(400).json({ message: "month is required" });

    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) return res.status(400).json({ message: "Invalid month format. Use YYYY-MM (e.g., 2024-01)" });

    const year = parseInt(month.split("-")[0], 10);

    // Attempt to record month closure first (prevents race-conditions / duplicate dues)
    const { data: insertedClosure, error: closureErr } = await supabase
      .from('month_closures')
      .insert({ month, year, closed_by: req.user?.id })
      .select()
      .maybeSingle();

    if (closureErr) {
      // If month already closed - return a friendly error
      if ((closureErr.code || '').toString().startsWith('23505') || (closureErr.message || '').toLowerCase().includes('duplicate')) {
        return res.status(400).json({ message: `Month ${month} has already been closed` });
      }
      console.error('Failed to insert month_closure:', closureErr);
      return res.status(500).json({ message: 'Failed to close month', detail: closureErr.message });
    }

    // Fetch all bills for the month (source-of-truth)
    const { data: bills } = await supabase
      .from("fee_bills")
      .select("id, student_id, total_amount, bill_status")
      .eq("month", month);

    if (!bills || bills.length === 0) {
      return res.json({ message: `No bills found for month ${month}` });
    }

    let createdDues = 0;
    let updatedBills = 0;

    for (const bill of bills) {
      // sum payments for this bill
      const { data: payments } = await supabase
        .from('fee_payments')
        .select('amount_paid')
        .eq('bill_id', bill.id);

      const totalPaid = (payments && payments.length)
        ? payments.reduce((s, p) => s + parseFloat(p.amount_paid || 0), 0)
        : 0;

      const remaining = Math.max(0, parseFloat(bill.total_amount || 0) - totalPaid);

      // If there's an unpaid remaining amount, create/update previous_dues (idempotent)
      if (remaining > 0) {
        const { data: existingDue } = await supabase
          .from('previous_dues')
          .select('id')
          .eq('student_id', bill.student_id)
          .eq('month', month)
          .limit(1)
          .single();

        if (existingDue) {
          await supabase
            .from('previous_dues')
            .update({ original_due: remaining, remaining_due: remaining, status: 'pending', cleared: false })
            .eq('id', existingDue.id);
        } else {
          await supabase
            .from('previous_dues')
            .insert({ student_id: bill.student_id, original_due: remaining, remaining_due: remaining, from_month: month, month, year, status: 'pending', cleared: false });
          createdDues++;
        }
      }

      // Do NOT apply advances during month-close. Advances are only applied at payment time.
      const netPayable = Math.max(0, remaining);

      const status = remaining === 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid');

      await supabase
        .from('fee_bills')
        .update({ net_payable: netPayable, bill_status: status })
        .eq('id', bill.id);

      updatedBills++;
    }

    // Month closure was recorded at the start of this operation to avoid races (see earlier insertion)
    // (DB-level fine trigger will already have run on that insert)

    res.json({ message: `Month ${month} closed. ${createdDues} dues created, ${updatedBills} bills updated.` });
  } catch (error) {
    console.error("Error closing month:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get dues for a student
 * GET /api/fees/dues/:student_id
 */
export const getStudentDues = async (req, res) => {
  try {
    const { student_id } = req.params;

    if (!student_id) {
      return res.status(400).json({
        message: "student_id is required",
      });
    }

    // Get all pending and uncleared dues for the student
    const { data: dues, error } = await supabase
      .from("previous_dues")
      .select("*")
      .eq("student_id", student_id)
      .eq("status", "pending")
      .eq("cleared", false)
      .order("month", { ascending: false });

    if (error) {
      return res.status(500).json({
        message: "Failed to fetch dues",
        error: error.message,
      });
    }

    const totalDues = dues?.reduce((sum, d) => sum + (parseFloat(d.remaining_due || 0)), 0) || 0;

    res.json({
      message: "Dues fetched successfully",
      student_id,
      total_dues: totalDues,
      dues: dues || [],
      count: dues?.length || 0,
    });
  } catch (error) {
    console.error("Error getting dues:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Get fee list for dashboard
 * GET /api/fees/list?class=&section=&month=
 */
export const getFeeList = async (req, res) => {
  try {
    const { class: className, section, month } = req.query;

    /* ===============================
       1️⃣ INPUT VALIDATION
    =============================== */

    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM",
      });
    }

    /* ===============================
       2️⃣ FETCH STUDENTS (ONLY ACTIVE)
    =============================== */

    let studentQuery = supabase
      .from("students")
      .select("id, name, father_name, roll_no, class, section")
      .eq("status", "active"); // ✅ Only active students

    if (className) studentQuery = studentQuery.eq("class", className);
    if (section) studentQuery = studentQuery.eq("section", section);

    const { data: students, error: studentErr } = await studentQuery;

    if (studentErr) {
      return res.status(500).json({
        message: "Failed to fetch students",
        error: studentErr.message,
      });
    }

    if (!students || students.length === 0) {
      return res.json({
        message: "No students found",
        data: [],
        count: 0,
      });
    }

    const studentIds = students.map((s) => s.id);

    /* ===============================
       3️⃣ FETCH BILLS (STRICT)
    =============================== */

    let billQuery = supabase
      .from("fee_bills")
      .select("id, student_id, month, total_amount, bill_status")
      .in("student_id", studentIds);

    if (month) {
      billQuery = billQuery.eq("month", month);
    }

    const { data: bills, error: billErr } = await billQuery;

    if (billErr) {
      return res.status(500).json({
        message: "Failed to fetch fee bills",
        error: billErr.message,
      });
    }

    if (month && (!bills || bills.length === 0)) {
      return res.status(404).json({
        message: "Bill not generated for this month",
      });
    }

    if (!bills || bills.length === 0) {
      return res.json({
        message: "No bills found",
        data: [],
        count: 0,
      });
    }

    /* ===============================
       4️⃣ VERIFY STUDENT STATUS FIRST (CRITICAL - FILTER INACTIVE)
    =============================== */
    // ✅ CRITICAL: Fetch current student statuses to filter out inactive students
    const billStudentIds = [...new Set((bills || []).map(b => b.student_id))];
    
    const { data: currentStudents, error: statusErr } = await supabase
      .from("students")
      .select("id, status")
      .in("id", billStudentIds);

    if (statusErr) {
      console.error("Failed to verify student status:", statusErr);
      return res.status(500).json({
        message: "Failed to verify student status",
        error: statusErr.message,
      });
    }

    // Create active student map - ONLY include students with status = "active"
    const activeStudentMap = {};
    (currentStudents || []).forEach(s => {
      if (s.status === "active") {
        activeStudentMap[s.id] = true;
      }
    });

    // ✅ CRITICAL: Filter bills - only include bills for ACTIVE students
    const activeBills = (bills || []).filter(bill => {
      const isActive = activeStudentMap[bill.student_id] === true;
      if (!isActive) {
        console.log(`Filtering out bill ${bill.id} - Student ${bill.student_id} is inactive`);
      }
      return isActive;
    });

    if (!activeBills || activeBills.length === 0) {
      return res.json({
        message: "No bills found for active students",
        data: [],
        count: 0,
      });
    }

    const activeBillIds = activeBills.map((b) => b.id);

    const billsByStudent = {};
    activeBills.forEach((b) => {
      billsByStudent[b.student_id] = b;
    });

    /* ===============================
       5️⃣ FETCH BILL ITEMS + PAYMENTS (ONLY FOR ACTIVE BILLS)
    =============================== */

    const [
      { data: billItems, error: itemErr },
      { data: payments, error: payErr },
    ] = await Promise.all([
      supabase
        .from("fee_bill_items")
        .select("bill_id, fee_name, amount")
        .in("bill_id", activeBillIds), // ✅ Only fetch items for active bills

      supabase
        .from("fee_payments")
        .select("bill_id, amount_paid")
        .in("bill_id", activeBillIds), // ✅ Only fetch payments for active bills
    ]);

    if (itemErr || payErr) {
      return res.status(500).json({
        message: "Failed to fetch bill details",
        error: itemErr?.message || payErr?.message,
      });
    }

    /* ===============================
       6️⃣ MAP DATA CLEANLY
    =============================== */

    const itemsByBill = {};
    billItems?.forEach((item) => {
      if (!itemsByBill[item.bill_id]) itemsByBill[item.bill_id] = [];
      itemsByBill[item.bill_id].push(item);
    });

    const paidByBill = {};
    payments?.forEach((p) => {
      paidByBill[p.bill_id] =
        (paidByBill[p.bill_id] || 0) + parseFloat(p.amount_paid || 0);
    });

    /* ===============================
       6️⃣ FINAL RESPONSE BUILD (ONLY ACTIVE STUDENTS)
    =============================== */

    const result = students
      .filter(student => {
        // ✅ CRITICAL: Only include if student has an active bill
        // This ensures we only show students who are active AND have bills
        return billsByStudent[student.id] !== undefined;
      })
      .map((student) => {
        const bill = billsByStudent[student.id];

        if (!bill) return null; // month filter case

      const items = itemsByBill[bill.id] || [];
      const totalPaid = paidByBill[bill.id] || 0;

      const breakdown = {
        tuition_fee: 0,
        exam_fee: 0,
        annual_fee: 0,
        computer_fee: 0,
        transport_fee: 0,
        previous_due: 0,
      };

      items.forEach((item) => {
        const name = (item.fee_name || "").toLowerCase();
        const amt = parseFloat(item.amount || 0);

        if (name.includes("tuition")) breakdown.tuition_fee += amt;
        else if (name.includes("exam")) breakdown.exam_fee += amt;
        else if (name.includes("annual")) breakdown.annual_fee += amt;
        else if (name.includes("computer")) breakdown.computer_fee += amt;
        else if (name.includes("transport")) breakdown.transport_fee += amt;
        else if (name.includes("previous")) breakdown.previous_due += amt;
      });

      // Calculate total_fee from breakdown instead of bill.total_amount
      const totalFee = breakdown.tuition_fee + breakdown.exam_fee + breakdown.annual_fee + breakdown.computer_fee + breakdown.transport_fee + breakdown.previous_due;
      const netPayable = Math.max(0, totalFee - totalPaid);

      return {
        student_id: student.id,
        student_name: student.name,
        father_name: student.father_name,
        roll_no: student.roll_no,
        class: student.class,
        section: student.section,
        bill_id: bill.id,
        month: bill.month,
        bill_status: bill.bill_status,
        ...breakdown,
        total_fee: totalFee,
        total_paid: totalPaid,
        net_payable: parseFloat(netPayable.toFixed(2)),
      };
    }).filter(Boolean);

    /* ===============================
       7️⃣ SUCCESS RESPONSE
    =============================== */

    return res.json({
      message: "Fee list fetched successfully",
      data: result,
      count: result.length,
    });

  } catch (error) {
    console.error("Get Fee List Error:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Record fee payment
 * POST /api/fees/pay
 * Body: {
 *   class, section, roll_number, amount_paid, payment_mode, payment_date?, month?
 * }
 */
export const payFee = async (req, res) => {
  try {
    const {
      class: className,
      roll_number,
      section,
      amount_paid,
      payment_mode,
      month,
      payment_date
    } = req.body;

    // Basic input validation
    if (!className || !roll_number || !section || amount_paid == null || !payment_mode || !month || !payment_date) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const allowedModes = ['cash','upi','online','cheque','bank_transfer','advance','advance_adjustment','dues_adjustment','adjustment'];
    if (!allowedModes.includes(String(payment_mode).toLowerCase())) {
      return res.status(400).json({ message: `invalid payment_mode. allowed: ${allowedModes.join(',')}` });
    }

    const amount = parseFloat(amount_paid);
    if (!isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'amount_paid must be a positive number' });

    // 1) Resolve student (class + roll_no + section)
    const { data: student, error: studentErr } = await supabase
      .from("students")
      .select("id")
      .eq("class", className)
      .eq("roll_no", roll_number)
      .eq("section", section)
      .single();

    if (studentErr || !student) return res.status(404).json({ message: 'Student not found' });
    const student_id = student.id;

    // 2) Resolve bill for the month (source-of-truth)
    const { data: bill, error: billErr } = await supabase
      .from('fee_bills')
      .select('id, month')
      .eq('student_id', student_id)
      .eq('month', month)
      .single();

    if (billErr || !bill) return res.status(404).json({ message: 'Bill not found for this month' });

    // 3) Call atomic DB function to process payment (prevents race conditions)
    const { data: rpcData, error: rpcErr } = await supabase.rpc('fn_process_payment', {
      p_student_id: student_id,
      p_bill_id: bill.id,
      p_amount: amount,
      p_payment_mode: payment_mode,
      p_payment_date: payment_date,
      p_month: month,
      p_transaction_id: req.body.transaction_id || null
    });

    if (rpcErr) {
      console.error('fn_process_payment error:', rpcErr);
      return res.status(400).json({ message: rpcErr.message || 'payment failed', detail: rpcErr });
    }

    // rpcData may be returned as an object or array depending on Postgres/Supabase version
    const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;

    // 4) Return canonical response (use DB-returned values)
    return res.json({
      message: 'Payment processed successfully',
      student_id,
      bill_id: bill.id,
      payment: result,
    });
  } catch (error) {
    console.error('Error processing payment (controller):', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get invoice details
 * GET /api/fees/invoice/:bill_id
 */
export const getInvoice = async (req, res) => {
  try {
    const { bill_id } = req.params;

    if (!bill_id) {
      return res.status(400).json({
        message: "bill_id is required",
      });
    }

    // 🔹 1️⃣ Fetch bill + student
    const { data: bill, error: billError } = await supabase
      .from("fee_bills")
      .select(`
        *,
        students (
          id,
          name,
          father_name,
          roll_no,
          class,
          section
        )
      `)
      .eq("id", bill_id)
      .single();

    if (billError || !bill) {
      return res.status(404).json({
        message: "Bill not found",
      });
    }

    // 🔹 2️⃣ Fetch bill items
    const { data: billItems, error: itemsError } = await supabase
      .from("fee_bill_items")
      .select("*")
      .eq("bill_id", bill_id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      return res.status(500).json({
        message: "Failed to fetch bill items",
        error: itemsError.message,
      });
    }

    // 🔹 3️⃣ Fetch normal payments (cash/upi/etc)
    const { data: payments, error: paymentsError } = await supabase
      .from("fee_payments")
      .select("*")
      .eq("bill_id", bill_id)
      .order("payment_date", { ascending: false });

    if (paymentsError) {
      return res.status(500).json({
        message: "Failed to fetch payments",
        error: paymentsError.message,
      });
    }

    const totalPaid =
      payments?.reduce(
        (sum, p) => sum + parseFloat(p.amount_paid || 0),
        0
      ) || 0;

    // 🔹 4️⃣ Fetch advance USED for this bill
    const { data: advanceUsedRows } = await supabase
      .from("advance_ledger")
      .select("amount")
      .eq("used_for_bill_id", bill_id)
      .eq("status", "used");

    const advanceUsed =
      advanceUsedRows?.reduce(
        (sum, a) => sum + parseFloat(a.amount || 0),
        0
      ) || 0;

    const totalPaidIncludingAdvance = totalPaid + advanceUsed;

    const remaining = Math.max(
      0,
      parseFloat(bill.total_amount || 0) - totalPaidIncludingAdvance
    );

    // 🔹 5️⃣ Fetch current active advance balance (remaining advance)
    const { data: activeAdvanceRows } = await supabase
      .from("advance_ledger")
      .select("amount")
      .eq("student_id", bill.student_id)
      .eq("status", "active");

    const activeAdvanceBalance =
      activeAdvanceRows?.reduce(
        (sum, a) => sum + parseFloat(a.amount || 0),
        0
      ) || 0;

    return res.json({
      message: "Invoice fetched successfully",
      invoice: {
        bill_id: bill.id,
        invoice_number: `INV-${bill.id.substring(0, 8).toUpperCase()}`,
        date: bill.created_at,
        month: bill.month,

        student: bill.students,

        items: billItems || [],

        payments: payments || [],

        summary: {
          total_amount: parseFloat(bill.total_amount || 0),
          total_paid: totalPaid,
          advance_used: advanceUsed,
          total_paid_including_advance: totalPaidIncludingAdvance,
          remaining: remaining,
          active_advance_balance: activeAdvanceBalance,
          status:
            remaining === 0
              ? "paid"
              : totalPaidIncludingAdvance > 0
              ? "partial"
              : "unpaid",
        },
      },
    });
  } catch (error) {
    console.error("Error getting invoice:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};


// Ensure calculations are reflected in next month's bill generation
export const generateNextMonthBills = async (req, res) => {
  try {
    const { month } = req.body;

    if (!month) {
      return res.status(400).json({ message: "month is required" });
    }

    const nextMonth = new Date(month);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const nextMonthStr = nextMonth.toISOString().slice(0, 7);

    // Fetch all students
    const { data: students } = await supabase
      .from("students")
      .select("id, class, uses_transport, transport_charge");

    for (const student of students) {
      // Sum all active advances for the student (support multiple advance_ledger rows)
      const { data: advanceRows } = await supabase
        .from('advance_ledger')
        .select('amount')
        .eq('student_id', student.id)
        .eq('status', 'active');

      const advanceSum = (advanceRows && advanceRows.length)
        ? advanceRows.reduce((s, r) => s + parseFloat(r.amount || 0), 0)
        : 0;

      // SUM all pending previous_dues for the student
      const { data: duesRows } = await supabase
        .from("previous_dues")
        .select("remaining_due")
        .eq("student_id", student.id)
        .eq("status", "pending")
        .eq("cleared", false);

      const previousDueSum = (duesRows && duesRows.length)
        ? duesRows.reduce((s, r) => s + parseFloat(r.remaining_due || 0), 0)
        : 0;

      // Compute total fee for the class (use fee_structure if present; fallback to hardcoded example)
      let totalFee = 0;
      try {
        const { data: fsRows } = await supabase
          .from('fee_structure')
          .select('tuition_fee, exam_fee, annual_fee, computer_fee, fee_amount, fee_name')
          .eq('class', student.class);

        if (fsRows && fsRows.length > 0) {
          // normalized rows or legacy single-row format
          if (fsRows[0].tuition_fee !== undefined) {
            totalFee = fsRows.reduce((s, r) => s + (parseFloat(r.tuition_fee || 0) + parseFloat(r.exam_fee || 0) + parseFloat(r.annual_fee || 0) + parseFloat(r.computer_fee || 0)), 0);
          } else {
            totalFee = fsRows.reduce((s, r) => s + (parseFloat(r.fee_amount || 0)), 0);
          }
        } else {
          // fallback (kept for backward compatibility)
          totalFee = 1000 + 200 + 500 + 300; // tuition + exam + annual + computer
        }
      } catch (e) {
        console.error('Failed to fetch fee_structure for class', student.class, e);
        totalFee = 1000 + 200 + 500 + 300;
      }

      const transportFee = student.uses_transport ? parseFloat(student.transport_charge || 0) : 0;
      const grossTotalAmount = totalFee + transportFee + previousDueSum; // total_amount stored on bill

      // net_payable must subtract existing active advances
      const netPayable = Math.max(0, grossTotalAmount - advanceSum);

      // skip if bill already exists for the next month (idempotent)
      const { data: existingBill } = await supabase
        .from('fee_bills')
        .select('id')
        .eq('student_id', student.id)
        .eq('month', nextMonthStr)
        .single();

      if (existingBill) {
        continue;
      }

      // Insert normalized bill row and add a previous-due line item when needed
      const { data: insertedBill, error: insertErr } = await supabase
        .from('fee_bills')
        .insert({
          student_id: student.id,
          month: nextMonthStr,
          year: parseInt(nextMonthStr.split('-')[0], 10),
          total_amount: parseFloat(grossTotalAmount.toFixed(2)),
          net_payable: parseFloat(netPayable.toFixed(2))
        })
        .select()
        .single();

      if (insertErr || !insertedBill) {
        console.error('Failed to create bill for student', student.id, insertErr || 'no data');
        continue;
      }

      if (previousDueSum > 0) {
        await supabase
          .from('fee_bill_items')
          .insert({ bill_id: insertedBill.id, fee_name: 'Previous Due', amount: previousDueSum });
      }
    }

    res.json({ message: `Bills generated for ${nextMonthStr}` });
  } catch (error) {
    console.error("Error generating next month's bills:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Record payment, calculate dues and advances, and return detailed response
export const recordPayment = async (req, res) => {
  try {
    const { student_id, amount_paid, payment_mode, bill_id, month, payment_date } = req.body;

    if (!student_id || amount_paid == null || !payment_mode || !month) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const amount = parseFloat(amount_paid);
    if (!isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'amount_paid must be a positive number' });

    const isDuesPayment = payment_mode === 'dues_adjustment' || payment_mode === 'dues';
    const isAdvancePayment = payment_mode === 'advance';

    // 1) If this payment is explicitly for previous dues -> use DB function to atomically apply FIFO
    if (isDuesPayment) {
      const { data, error } = await supabase.rpc('fn_pay_previous_dues', {
        p_student_id: student_id,
        p_amount: amount,
        p_payment_mode: payment_mode,
        p_payment_date: payment_date || new Date().toISOString().split('T')[0],
        p_month: month,
      });

      if (error) return res.status(400).json({ message: error.message, detail: error });
      return res.json({ message: 'Dues payment applied', data });
    }

    // 2) If this is an explicit advance (no bill) -> fn_process_payment handles advance creation atomically
    if (!bill_id && isAdvancePayment) {
      const { data, error } = await supabase.rpc('fn_process_payment', {
        p_student_id: student_id,
        p_bill_id: null,
        p_amount: amount,
        p_payment_mode: payment_mode,
        p_payment_date: payment_date || new Date().toISOString().split('T')[0],
        p_month: month,
        p_transaction_id: req.body.transaction_id || null
      });
      if (error) return res.status(400).json({ message: error.message, detail: error });
      return res.json({ message: 'Advance recorded', data });
    }

    // 3) If payment targets a specific bill -> use atomic fn_process_payment
    if (bill_id) {
      const { data, error } = await supabase.rpc('fn_process_payment', {
        p_student_id: student_id,
        p_bill_id: bill_id,
        p_amount: amount,
        p_payment_mode: payment_mode,
        p_payment_date: payment_date || new Date().toISOString().split('T')[0],
        p_month: month,
        p_transaction_id: req.body.transaction_id || null
      });

      if (error) return res.status(400).json({ message: error.message, detail: error });
      return res.json({ message: 'Payment applied to bill', data });
    }

    // 4) Fallback: record a generic (unlinked) payment via server-side RPC for atomicity
    const { data: unlinkedData, error: unlinkedErr } = await supabase.rpc('fn_process_payment', {
      p_student_id: student_id,
      p_bill_id: null,
      p_amount: amount,
      p_payment_mode: payment_mode,
      p_payment_date: payment_date || new Date().toISOString().split('T')[0],
      p_month: month,
      p_transaction_id: req.body.transaction_id || null
    });

    if (unlinkedErr) return res.status(500).json({ message: unlinkedErr.message, detail: unlinkedErr });
    return res.json({ message: 'Payment recorded (unlinked)', data: unlinkedData });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

