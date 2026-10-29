import { supabase } from "../services/supabase.js";
import { getDues, getTotalPaid, getTotalFee, calculateAdvance } from "../utils/feeHelper.js";
import {
  loadBillNotificationContext,
  sendStudentPushNotification,
} from "../services/studentNotificationService.js";
import {
  getCachedBillPdf,
  setCachedBillPdf,
  invalidateBillPdf,
  uploadPdfBuffer,
} from "../services/pdfCache.service.js";

const toSafeString = (value) => String(value ?? "").trim();

const normalizeClassToken = (value) => {
  const text = toSafeString(value).replace(/\s+/g, " ");
  if (!text) return "";
  const compact = text.replace(/[\s-]+/g, "").toLowerCase();
  return compact === "mothercare" || compact === "nursery" ? "Nursery" : text;
};

const buildClassVariants = (value) => {
  const normalized = normalizeClassToken(value);
  if (!normalized) return [];
  return normalized === "Nursery" ? ["Nursery", ["Mother", "Care"].join(" ")] : [normalized];
};

const resolveCurrentStudentForPayment = async ({
  className,
  rollNumber,
  section,
}) => {
  const classToken = normalizeClassToken(className);
  const classVariants = buildClassVariants(classToken);
  const rollToken = toSafeString(rollNumber);
  const sectionToken = toSafeString(section);

  let query = supabase
    .from("students")
    .select("id, class, section, roll_no, status, academic_year, created_at")
    .in("class", classVariants)
    .eq("roll_no", rollToken)
    .eq("status", "active")
    .order("academic_year", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (sectionToken) {
    query = query.ilike("section", sectionToken);
  }

  const { data, error } = await query;
  if (error) {
    return { student: null, error };
  }

  if (data?.length) {
    return { student: data[0], error: null };
  }

  // Fallback: if the active row is not found because section matching is stored
  // differently, try a direct class/roll lookup and still prefer the latest row.
  let fallbackQuery = supabase
    .from("students")
    .select("id, class, section, roll_no, status, academic_year, created_at")
    .in("class", classVariants)
    .eq("roll_no", rollToken)
    .eq("status", "active")
    .order("academic_year", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (sectionToken) {
    fallbackQuery = fallbackQuery.eq("section", sectionToken);
  }

  const { data: fallbackData, error: fallbackError } = await fallbackQuery;
  if (fallbackError) {
    return { student: null, error: fallbackError };
  }

  return { student: fallbackData?.[0] || null, error: null };
};

/**
 * Core engine to close a month - calculates unpaid balances, updates fee bills, and creates previous dues.
 * Safe to be executed by both Admin API and automated CRON scheduler.
 * @param {string} month - Month in "YYYY-MM" format (e.g., "2026-10")
 * @param {string|null} closedBy - UUID of the user closing the month, or null for system
 */
export const executeMonthClosure = async (month, closedBy = null) => {
  if (!month) throw new Error("month is required");

  const monthRegex = /^\d{4}-\d{2}$/;
  if (!monthRegex.test(month)) {
    throw new Error("Invalid month format. Use YYYY-MM (e.g., 2026-10)");
  }

  const year = parseInt(month.split("-")[0], 10);

  // Check if month is already recorded as closed
  const { data: existingClosure } = await supabase
    .from('month_closures')
    .select('id, month, year, closed_at')
    .eq('month', month)
    .maybeSingle();

  if (existingClosure) {
    return {
      alreadyClosed: true,
      message: `Month ${month} has already been closed.`,
      closure: existingClosure,
      createdDues: 0,
      updatedBills: 0
    };
  }

  // Attempt to record month closure first (prevents race-conditions / duplicate dues)
  const { data: insertedClosure, error: closureErr } = await supabase
    .from('month_closures')
    .insert({ month, year, closed_by: closedBy || null })
    .select()
    .maybeSingle();

  if (closureErr) {
    // If month already closed - return a friendly flag
    if ((closureErr.code || '').toString().startsWith('23505') || (closureErr.message || '').toLowerCase().includes('duplicate')) {
      return {
        alreadyClosed: true,
        message: `Month ${month} has already been closed.`,
        createdDues: 0,
        updatedBills: 0
      };
    }
    console.error('Failed to insert month_closure:', closureErr);
    throw closureErr;
  }

  // Fetch all bills for the month (source-of-truth)
  const { data: bills, error: billsErr } = await supabase
    .from("fee_bills")
    .select("id, student_id, total_amount, bill_status")
    .eq("month", month);

  if (billsErr) {
    console.error("Error fetching fee_bills for month:", month, billsErr);
  }

  if (!bills || bills.length === 0) {
    return {
      success: true,
      alreadyClosed: false,
      message: `Month ${month} closed. (No bills found for this month)`,
      createdDues: 0,
      updatedBills: 0,
      closure: insertedClosure
    };
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
        .maybeSingle();

      if (existingDue) {
        await supabase
          .from('previous_dues')
          .update({ original_due: remaining, remaining_due: remaining, status: 'pending', cleared: false })
          .eq('id', existingDue.id);
      } else {
        await supabase
          .from('previous_dues')
          .insert({
            student_id: bill.student_id,
            original_due: remaining,
            remaining_due: remaining,
            from_month: month,
            month,
            year,
            status: 'pending',
            cleared: false
          });
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

  return {
    success: true,
    alreadyClosed: false,
    message: `Month ${month} closed successfully. ${createdDues} dues created, ${updatedBills} bills updated.`,
    createdDues,
    updatedBills,
    closure: insertedClosure
  };
};

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
    if (!monthRegex.test(month)) return res.status(400).json({ message: "Invalid month format. Use YYYY-MM (e.g., 2026-10)" });

    const result = await executeMonthClosure(month, req.user?.id || null);

    if (result.alreadyClosed) {
      return res.status(400).json({ message: result.message });
    }

    return res.json({
      message: result.message,
      createdDues: result.createdDues,
      updatedBills: result.updatedBills,
      closure: result.closure
    });
  } catch (error) {
    console.error("Error closing month:", error);
    if ((error.code || '').toString().startsWith('23505') || (error.message || '').toLowerCase().includes('duplicate')) {
      return res.status(400).json({ message: `Month ${req.body?.month} has already been closed` });
    }
    return res.status(500).json({ message: "Failed to close month", error: error.message });
  }
};

/**
 * Get Month Closure Status & Auto-Close Schedule info
 * GET /api/fees/closure-status?month=YYYY-MM
 */
export const getMonthClosureStatus = async (req, res) => {
  try {
    const now = new Date();
    const istString = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const istDate = new Date(istString);
    const yyyy = istDate.getFullYear();
    const mm = String(istDate.getMonth() + 1).padStart(2, "0");
    const defaultMonth = `${yyyy}-${mm}`;

    const month = req.query.month || defaultMonth;

    const { data: closure } = await supabase
      .from('month_closures')
      .select('id, month, year, closed_at, closed_by')
      .eq('month', month)
      .maybeSingle();

    return res.json({
      success: true,
      month,
      isClosed: !!closure,
      closure: closure || null,
      autoCloseSchedule: {
        pattern: "Last day of every month at 6:00 PM IST (18:00)",
        status: "ACTIVE",
        timezone: "Asia/Kolkata"
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
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
      .select("id, name, father_name, roll_no, class, section, uses_transport, transport_charge")
      .eq("status", "active"); // ✅ Only active students

    if (className) studentQuery = studentQuery.in("class", buildClassVariants(className));
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
      .select("id, student_id, month, total_amount, bill_status, created_at")
      .in("student_id", studentIds)
      .order("month", { ascending: false });

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

    const studentMap = {};
    students.forEach((s) => {
      studentMap[s.id] = s;
    });

    // Sort activeBills by month DESC, then student class, section, roll_no
    activeBills.sort((a, b) => {
      const mCmp = (b.month || "").localeCompare(a.month || "");
      if (mCmp !== 0) return mCmp;
      const sA = studentMap[a.student_id];
      const sB = studentMap[b.student_id];
      const cCmp = (sA?.class || "").localeCompare(sB?.class || "", undefined, { numeric: true });
      if (cCmp !== 0) return cCmp;
      const secCmp = (sA?.section || "").localeCompare(sB?.section || "");
      if (secCmp !== 0) return secCmp;
      const rA = parseInt(sA?.roll_no || 0, 10);
      const rB = parseInt(sB?.roll_no || 0, 10);
      return rA - rB;
    });

    /* ===============================
       5️⃣ FETCH BILL ITEMS, PAYMENTS & ADVANCES (ONLY FOR ACTIVE BILLS)
    =============================== */

    const [
      { data: billItems, error: itemErr },
      { data: payments, error: payErr },
      { data: usedAdvances, error: advErr },
    ] = await Promise.all([
      supabase
        .from("fee_bill_items")
        .select("bill_id, fee_name, amount")
        .in("bill_id", activeBillIds), // ✅ Only fetch items for active bills

      supabase
        .from("fee_payments")
        .select("bill_id, amount_paid, payment_mode")
        .in("bill_id", activeBillIds), // ✅ Only fetch payments for active bills

      supabase
        .from("advance_ledger")
        .select("used_for_bill_id, amount")
        .eq("status", "used")
        .in("used_for_bill_id", activeBillIds),
    ]);

    if (itemErr || payErr || advErr) {
      return res.status(500).json({
        message: "Failed to fetch bill details",
        error: itemErr?.message || payErr?.message || advErr?.message,
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

    const advanceLedgerByBill = {};
    usedAdvances?.forEach((adv) => {
      if (adv.used_for_bill_id) {
        advanceLedgerByBill[adv.used_for_bill_id] =
          (advanceLedgerByBill[adv.used_for_bill_id] || 0) + parseFloat(adv.amount || 0);
      }
    });

    const directPaidByBill = {};
    const advancePaidByBill = {};
    const paymentModesByBill = {};

    payments?.forEach((p) => {
      const amt = parseFloat(p.amount_paid || 0);
      const mode = (p.payment_mode || "").toLowerCase();

      if (mode && mode !== "dues_adjustment") {
        if (!paymentModesByBill[p.bill_id]) paymentModesByBill[p.bill_id] = [];
        paymentModesByBill[p.bill_id].push(mode);
      }

      if (mode === "advance") {
        advancePaidByBill[p.bill_id] = (advancePaidByBill[p.bill_id] || 0) + amt;
      } else {
        directPaidByBill[p.bill_id] = (directPaidByBill[p.bill_id] || 0) + amt;
      }
    });

    /* ===============================
       6️⃣ FINAL RESPONSE BUILD (ACCURATE TO EACH MONTH'S BILL)
    =============================== */

    const result = activeBills
      .map((bill) => {
        const student = studentMap[bill.student_id];
        if (!student) return null;

        const items = itemsByBill[bill.id] || [];
        const directPaid = directPaidByBill[bill.id] || 0;
        const advancePaid = Math.max(advancePaidByBill[bill.id] || 0, advanceLedgerByBill[bill.id] || 0);
        const totalPaid = directPaid + advancePaid;

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

        // Ensure transport fee is included for students using transport if missing or 0 in items
        const isUsingTransport = Boolean(
          student.uses_transport === true ||
          String(student.uses_transport).toLowerCase() === 'true' ||
          student.uses_transport === 1
        );
        const studentTransportCharge = parseFloat(student.transport_charge || 0);
        if (isUsingTransport && studentTransportCharge > 0 && breakdown.transport_fee === 0) {
          breakdown.transport_fee = studentTransportCharge;
        }

        // Calculate total_fee from breakdown instead of bill.total_amount
        const totalFee = breakdown.tuition_fee + breakdown.exam_fee + breakdown.annual_fee + breakdown.computer_fee + breakdown.transport_fee + breakdown.previous_due;
        const isBillPaid = totalPaid >= totalFee && totalFee > 0
          ? true
          : bill.bill_status === "paid"
            ? true
            : false;
        const netPayable = isBillPaid ? 0 : Math.max(0, totalFee - totalPaid);
        const billStatus = isBillPaid ? "paid" : (totalPaid > 0 && netPayable > 0 ? "partial" : (bill.bill_status === "partial" ? "partial" : "unpaid"));
        const duesSettledViaNext = (isBillPaid && totalPaid < totalFee) ? (totalFee - totalPaid) : 0;
        const advanceGenerated = Math.max(0, directPaid - totalFee);
        const amountSettled = Math.min(totalFee, totalPaid) + duesSettledViaNext;
        const displayPaid = isBillPaid ? Math.max(totalPaid, amountSettled) : totalPaid;

        const rawModes = [...new Set(paymentModesByBill[bill.id] || [])];
        let primaryMode = "--";
        if (rawModes.length > 0) {
          primaryMode = rawModes.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(", ");
        } else if (advancePaid > 0) {
          primaryMode = "Advance";
        } else if (isBillPaid) {
          primaryMode = duesSettledViaNext > 0 ? "Settled in Next Bill" : "Cash";
        }

        return {
          student_id: student.id,
          student_name: student.name,
          father_name: student.father_name,
          roll_no: student.roll_no,
          class: student.class,
          section: student.section,
          bill_id: bill.id,
          month: bill.month,
          bill_status: billStatus,
          ...breakdown,
          total_fee: totalFee,
          total_paid: displayPaid,
          direct_paid: directPaid,
          amount_settled: amountSettled,
          advance_used: advancePaid,
          advance_generated: advanceGenerated,
          dues_settled: duesSettledViaNext,
          net_payable: parseFloat(netPayable.toFixed(2)),
          payment_mode: primaryMode,
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

    const allowedModes = ['cash', 'upi', 'online', 'cheque', 'bank_transfer', 'advance', 'advance_adjustment', 'dues_adjustment', 'adjustment'];
    if (!allowedModes.includes(String(payment_mode).toLowerCase())) {
      return res.status(400).json({ message: `invalid payment_mode. allowed: ${allowedModes.join(',')}` });
    }

    const amount = parseFloat(amount_paid);
    if (!isFinite(amount) || amount <= 0) return res.status(400).json({ message: 'amount_paid must be a positive number' });

    // 1) Resolve student (class + roll_no + section)
    const { student, error: studentErr } = await resolveCurrentStudentForPayment({
      className,
      rollNumber: roll_number,
      section,
    });

    if (studentErr) {
      console.error("Failed to resolve student for payment:", studentErr);
      return res.status(500).json({
        message: "Failed to resolve student",
        error: studentErr.message,
      });
    }

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

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

    try {
      const billContext = await loadBillNotificationContext(bill.id);
      const amountPaid = Number.parseFloat(result?.amount_paid || amount || 0) || amount;
      const remaining = Number.parseFloat(result?.remaining ?? billContext.summary.remaining ?? 0) || 0;
      const paymentModeLabel = String(payment_mode || "").replace(/_/g, " ").toUpperCase();
      const receiptNumber = result?.receipt_no || result?.receipt_number || billContext.summary.receipt_number || null;
      const transactionId = result?.transaction_id || req.body.transaction_id || null;

      await sendStudentPushNotification({
        studentId: student_id,  // BUG FIX: was `studentId` (undefined), must be `student_id`
        title: `Fee payment recorded for ${billContext.month}`,
        body: `${billContext.student?.name || "Student"} | Paid Rs. ${amountPaid.toFixed(2)} via ${paymentModeLabel || "PAYMENT"} | Remaining Rs. ${remaining.toFixed(2)}`,
        notificationType: "fee_payment",
        sourceType: "fee_payments",
        sourceId: bill.id,
        data: {
          ...billContext,
          payment: {
            amount_paid: amountPaid,
            payment_mode,
            payment_date: payment_date || new Date().toISOString().slice(0, 10),
            transaction_id: transactionId,
            receipt_no: receiptNumber,
          },
          remaining,
          payment_summary: {
            bill_id: bill.id,
            month: billContext.month,
            status: remaining <= 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid",
          },
        },
      });
    } catch (notificationError) {
      console.error("Fee payment notification failed:", notificationError);
    }

    // 3.1) If this bill contains Previous Due, settle previous_dues and past bills
    try {
      const { data: billItems } = await supabase
        .from("fee_bill_items")
        .select("fee_name, amount")
        .eq("bill_id", bill.id);

      const prevDueItem = (billItems || []).find((i) =>
        (i.fee_name || "").toLowerCase().includes("previous")
      );
      const prevDueAmount = parseFloat(prevDueItem?.amount || 0);

      const { data: currentPayments } = await supabase
        .from("fee_payments")
        .select("amount_paid")
        .eq("bill_id", bill.id);

      const totalPaidOnBill = (currentPayments || []).reduce(
        (sum, p) => sum + parseFloat(p.amount_paid || 0),
        0
      );

      if (prevDueAmount > 0 && totalPaidOnBill > 0) {
        // Mark rolled previous_dues for this student as cleared
        await supabase
          .from("previous_dues")
          .update({
            cleared: true,
            status: "cleared",
            remaining_due: 0,
            remaining_dues: 0,
            updated_at: new Date().toISOString(),
          })
          .eq("student_id", student_id)
          .eq("cleared", false)
          .lte("month", month);

        // Mark previous bills (month < bill.month) for this student as paid
        const { data: prevBills } = await supabase
          .from("fee_bills")
          .select("id, month, year, total_amount, net_payable")
          .eq("student_id", student_id)
          .lt("month", month)
          .neq("bill_status", "paid");

        if (prevBills?.length) {
          for (const prevBill of prevBills) {
            const remainingOnPrev = parseFloat(prevBill.net_payable ?? prevBill.total_amount ?? 0);
            await supabase
              .from("fee_bills")
              .update({
                net_payable: 0,
                bill_status: "paid",
                updated_at: new Date().toISOString(),
              })
              .eq("id", prevBill.id);

            if (remainingOnPrev > 0) {
              await supabase.from("fee_payments").insert({
                student_id: student_id,
                bill_id: prevBill.id,
                amount_paid: remainingOnPrev,
                payment_mode: "dues_adjustment",
                payment_date: payment_date || new Date().toISOString().slice(0, 10),
                month: prevBill.month,
                year: prevBill.year || parseInt(prevBill.month.split("-")[0], 10),
                receipt_no: `ADJ-${bill.id.slice(0, 8).toUpperCase()}`,
              });
            }
          }
        }
      }
    } catch (clearErr) {
      console.error("Error clearing previous dues on bill payment:", clearErr);
    }

    // Invalidate cached PDF so refreshed receipt with updated payment will be generated next time
    if (bill?.id) {
      invalidateBillPdf(bill.id);
    }

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
          section,
          uses_transport,
          transport_charge
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

    let directPaid = 0;
    let advanceFromPayments = 0;

    payments?.forEach((p) => {
      const amt = parseFloat(p.amount_paid || 0);
      const mode = (p.payment_mode || "").toLowerCase();
      if (mode === "advance") {
        advanceFromPayments += amt;
      } else if (mode !== "dues_adjustment") {
        directPaid += amt;
      }
    });

    // 🔹 4️⃣ Fetch advance USED for this bill
    const { data: advanceUsedRows } = await supabase
      .from("advance_ledger")
      .select("amount")
      .eq("used_for_bill_id", bill_id)
      .eq("status", "used");

    const advanceUsedFromLedger =
      advanceUsedRows?.reduce(
        (sum, a) => sum + parseFloat(a.amount || 0),
        0
      ) || 0;

    const advanceUsed = Math.max(advanceFromPayments, advanceUsedFromLedger);
    const totalPaidIncludingAdvance = directPaid + advanceUsed;

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

    const finalBillItems = billItems ? [...billItems] : [];
    const studentObj = bill.students || {};
    const isStudentUsingTransport = Boolean(
      studentObj.uses_transport === true ||
      String(studentObj.uses_transport).toLowerCase() === 'true' ||
      studentObj.uses_transport === 1
    );
    const transportChargeAmt = parseFloat(studentObj.transport_charge || 0);
    const transportIdx = finalBillItems.findIndex(i => (i.fee_name || "").toLowerCase().includes("transport"));

    if (isStudentUsingTransport && transportChargeAmt > 0) {
      if (transportIdx >= 0) {
        if (parseFloat(finalBillItems[transportIdx].amount || 0) === 0) {
          finalBillItems[transportIdx] = { ...finalBillItems[transportIdx], amount: transportChargeAmt };
        }
      } else {
        finalBillItems.push({ fee_name: "Transport Fee", amount: transportChargeAmt });
      }
    }

    const computedItemsTotal = finalBillItems.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    const effectiveTotal = Math.max(parseFloat(bill.total_amount || 0), computedItemsTotal);
    const effectiveRemaining = Math.max(0, effectiveTotal - totalPaidIncludingAdvance);

    return res.json({
      message: "Invoice fetched successfully",
      invoice: {
        bill_id: bill.id,
        invoice_number: `INV-${bill.id.substring(0, 8).toUpperCase()}`,
        date: bill.created_at,
        month: bill.month,
        cached_pdf_url: getCachedBillPdf(bill.id)?.url || null,

        student: bill.students,

        items: finalBillItems,

        payments: payments || [],

        summary: {
          total_amount: effectiveTotal,
          direct_paid: directPaid,
          total_paid: directPaid,
          advance_used: advanceUsed,
          total_paid_including_advance: totalPaidIncludingAdvance,
          remaining: effectiveRemaining,
          active_advance_balance: activeAdvanceBalance,
          status:
            effectiveRemaining === 0
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

    // Fetch ONLY ACTIVE students (BUG FIX: was fetching all students including inactive/left)
    const { data: students } = await supabase
      .from("students")
      .select("id, class, uses_transport, transport_charge")
      .eq("status", "active");

    // BUG FIX: Null guard — students can be null if DB error or empty result
    if (!students || students.length === 0) {
      return res.json({ message: `No active students found. No bills generated for ${nextMonthStr}` });
    }

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

      // SUM all pending / rolled uncleared previous_dues for the student
      const { data: duesRows } = await supabase
        .from("previous_dues")
        .select("id, remaining_due, status, cleared, from_month, to_month")
        .eq("student_id", student.id)
        .eq("cleared", false)
        .gt("remaining_due", 0);

      const rolledForThisMonth = (duesRows || []).filter(
        (d) => d.to_month === nextMonthStr
      );
      const pendingBeforeThisMonth = (duesRows || []).filter(
        (d) => d.status === "pending" && (d.from_month || d.month) < nextMonthStr
      );

      let previousDueSum = 0;
      if (rolledForThisMonth.length > 0) {
        previousDueSum = rolledForThisMonth.reduce(
          (sum, d) => sum + parseFloat(d.remaining_due || 0),
          0
        );
      } else if (pendingBeforeThisMonth.length > 0) {
        previousDueSum = pendingBeforeThisMonth.reduce(
          (sum, d) => sum + parseFloat(d.remaining_due || 0),
          0
        );
      } else {
        const { data: prevBills } = await supabase
          .from("fee_bills")
          .select("id, month, total_amount, net_payable, bill_status")
          .eq("student_id", student.id)
          .lt("month", nextMonthStr)
          .order("month", { ascending: false });

        if (prevBills && prevBills.length > 0) {
          const lastBill = prevBills[0];
          if (lastBill.bill_status !== "paid") {
            const { data: payments } = await supabase
              .from("fee_payments")
              .select("amount_paid")
              .eq("bill_id", lastBill.id);

            const paid = (payments || []).reduce(
              (sum, p) => sum + parseFloat(p.amount_paid || 0),
              0
            );
            const remaining = Math.max(
              0,
              parseFloat(lastBill.total_amount || 0) - paid
            );
            if (remaining > 0) {
              previousDueSum = remaining;
            }
          }
        }
      }

      // Compute total fee for the class (use fee_structure if present; fallback to hardcoded example)
      let totalFee = 0;
      try {
        const { data: fsRows } = await supabase
          .from('fee_structures')  // BUG FIX: was 'fee_structure' (wrong table name)
          .select('fee_name, fee_amount')
          .eq('class', student.class);

        if (fsRows && fsRows.length > 0) {
          // normalized rows — sum up all fee_amount values
          totalFee = fsRows.reduce((s, r) => s + (parseFloat(r.fee_amount || 0)), 0);
        } else {
          // fallback (kept for backward compatibility)
          totalFee = 0; // tuition + exam + annual + computer
        }
      } catch (e) {
        console.error('Failed to fetch fee_structure for class', student.class, e);
        totalFee = 0;
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
          net_payable: parseFloat(grossTotalAmount.toFixed(2)),
          bill_status: 'unpaid'
        })
        .select()
        .single();

      if (insertErr || !insertedBill) {
        console.error('Failed to create bill for student', student.id, insertErr || 'no data');
        continue;
      }

      // Adjust active advances against this new bill
      let remainingToAdjust = grossTotalAmount;
      let totalAdvanceUsed = 0;

      const { data: activeAdvRows } = await supabase
        .from('advance_ledger')
        .select('id, amount')
        .eq('student_id', student.id)
        .eq('status', 'active')
        .order('created_at', { ascending: true });

      if (activeAdvRows?.length) {
        for (const adv of activeAdvRows) {
          if (remainingToAdjust <= 0) break;

          const advAmount = parseFloat(adv.amount || 0);
          const useAmount = Math.min(advAmount, remainingToAdjust);

          totalAdvanceUsed += useAmount;
          remainingToAdjust -= useAmount;

          if (useAmount === advAmount) {
            await supabase
              .from('advance_ledger')
              .update({
                status: 'used',
                used_for_bill_id: insertedBill.id,
                used_at: new Date().toISOString(),
              })
              .eq('id', adv.id);
          } else {
            await supabase
              .from('advance_ledger')
              .update({
                amount: advAmount - useAmount,
                used_for_bill_id: insertedBill.id,
                updated_at: new Date().toISOString(),
              })
              .eq('id', adv.id);
          }
        }
      }

      if (totalAdvanceUsed > 0) {
        const [yearPart] = nextMonthStr.split('-');
        await supabase.from('fee_payments').insert({
          student_id: student.id,
          bill_id: insertedBill.id,
          amount_paid: totalAdvanceUsed,
          payment_mode: 'advance',
          payment_date: new Date().toISOString().slice(0, 10),
          month: nextMonthStr,
          year: parseInt(yearPart, 10),
          receipt_no: `ADV-${insertedBill.id.slice(0, 8).toUpperCase()}`,
        });
      }

      const finalNetPayable = Math.max(0, grossTotalAmount - totalAdvanceUsed);
      const finalStatus =
        finalNetPayable === 0
          ? 'paid'
          : totalAdvanceUsed > 0
            ? 'partial'
            : 'unpaid';

      await supabase
        .from('fee_bills')
        .update({
          net_payable: parseFloat(finalNetPayable.toFixed(2)),
          bill_status: finalStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', insertedBill.id);

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

      try {
        await sendStudentPushNotification({
          studentId: student_id,
          title: "Previous dues payment received",
          body: `Rs. ${amount.toFixed(2)} adjusted against pending dues.`,
          notificationType: "dues_payment",
          sourceType: "previous_dues",
          sourceId: null,
          data: {
            student_id,
            amount_paid: amount,
            payment_mode,
            payment_date: payment_date || new Date().toISOString().split('T')[0],
            month,
            details: data,
          },
        });
      } catch (notificationError) {
        console.error('Dues payment notification failed:', notificationError);
      }

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

      try {
        const billContext = bill_id ? await loadBillNotificationContext(bill_id) : null;
        await sendStudentPushNotification({
          studentId: student_id,
          title: "Advance recorded",
          body: `Rs. ${amount.toFixed(2)} recorded as advance.`,
          notificationType: "advance_payment",
          sourceType: "advance_ledger",
          sourceId: bill_id || null,
          data: {
            student_id,
            amount_paid: amount,
            payment_mode,
            payment_date: payment_date || new Date().toISOString().split('T')[0],
            month,
            bill: billContext,
            details: data,
          },
        });
      } catch (notificationError) {
        console.error('Advance payment notification failed:', notificationError);
      }

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

      try {
        const billContext = await loadBillNotificationContext(bill_id);
        const transactionId = req.body.transaction_id || null;
        await sendStudentPushNotification({
          studentId: student_id,
          title: `Fee payment recorded for ${billContext.month}`,
          body: `${billContext.student?.name || "Student"} | Paid Rs. ${amount.toFixed(2)} via ${String(payment_mode || "").replace(/_/g, " ").toUpperCase()} | Remaining Rs. ${billContext.summary.remaining.toFixed(2)}`,
          notificationType: "fee_payment",
          sourceType: "fee_payments",
          sourceId: bill_id,
          data: {
            ...billContext,
            payment: {
              amount_paid: amount,
              payment_mode,
              payment_date: payment_date || new Date().toISOString().split('T')[0],
              transaction_id: transactionId,
            },
          },
        });
      } catch (notificationError) {
        console.error('Bill payment notification failed:', notificationError);
      }

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

    try {
      await sendStudentPushNotification({
        studentId: student_id,
        title: "Payment recorded",
        body: `Rs. ${amount.toFixed(2)} payment recorded.`,
        notificationType: "payment",
        sourceType: "fee_payments",
        sourceId: null,
        data: {
          student_id,
          amount_paid: amount,
          payment_mode,
          payment_date: payment_date || new Date().toISOString().split('T')[0],
          month,
          details: unlinkedData,
        },
      });
    } catch (notificationError) {
      console.error('Unlinked payment notification failed:', notificationError);
    }

    return res.json({ message: 'Payment recorded (unlinked)', data: unlinkedData });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * GET /api/fees/dashboard
 * Returns real overview data for fee dashboard:
 * - KPIs: Total collected, collected this month, pending dues, pending students count, payment modes
 * - Recent transactions
 * - Class-wise fee realization
 * - Defaulters list
 */
export const getFeeDashboardOverview = async (req, res) => {
  try {
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 1. Fetch all fee payments (joined with fee_bills and students)
    const { data: payments, error: payErr } = await supabase
      .from("fee_payments")
      .select(`
        id,
        amount_paid,
        payment_mode,
        payment_date,
        receipt_no,
        transaction_id,
        created_at,
        bill_id,
        student_id,
        fee_bills (
          id,
          month,
          receipt_number,
          bill_status,
          total_amount,
          net_payable,
          students (
            id,
            name,
            class,
            section,
            roll_no,
            status
          )
        )
      `)
      .order("created_at", { ascending: false });

    if (payErr) {
      console.error("Dashboard payments query error:", payErr);
      return res.status(500).json({ message: "Failed to fetch payments", error: payErr.message });
    }

    // 2. Fetch all fee bills (joined with active students)
    const { data: bills, error: billErr } = await supabase
      .from("fee_bills")
      .select(`
        id,
        student_id,
        month,
        year,
        due_date,
        total_amount,
        net_payable,
        bill_status,
        receipt_number,
        created_at,
        students (
          id,
          name,
          class,
          section,
          roll_no,
          status
        )
      `)
      .order("created_at", { ascending: false });

    if (billErr) {
      console.error("Dashboard bills query error:", billErr);
      return res.status(500).json({ message: "Failed to fetch bills", error: billErr.message });
    }

    const allPayments = payments || [];
    const allBills = bills || [];

    // --- KPI 1: Total Collected ---
    const totalCollected = allPayments.reduce(
      (sum, p) => sum + Number(p.amount_paid || 0),
      0
    );

    // --- KPI 2: Collected This Month ---
    const thisMonthPayments = allPayments.filter((p) => {
      const pDate = p.payment_date || p.created_at || "";
      return pDate.startsWith(currentMonthKey);
    });
    const collectedThisMonth = thisMonthPayments.reduce(
      (sum, p) => sum + Number(p.amount_paid || 0),
      0
    );
    const transactionsCountThisMonth = thisMonthPayments.length;

    // --- Group bills by student_id to find the latest bill per student ---
    // Previous dues are rolled into the next month's bill, so each student's current
    // outstanding due is strictly their latest bill's net_payable (adjusted for any payments).
    const studentLatestBillMap = new Map();
    const sortedBills = [...allBills].sort((a, b) => {
      const cmp = String(b.month || '').localeCompare(String(a.month || ''));
      if (cmp !== 0) return cmp;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

    sortedBills.forEach((b) => {
      if (!studentLatestBillMap.has(b.student_id)) {
        studentLatestBillMap.set(b.student_id, b);
      }
    });

    // --- KPI 3: Real Pending Dues & Pending Students (Single source of truth) ---
    let totalPendingDues = 0;
    const pendingStudentsList = [];

    studentLatestBillMap.forEach((latestBill) => {
      const due = Number(latestBill.net_payable || 0);
      if (latestBill.bill_status !== "paid" && due > 0) {
        totalPendingDues += due;
        pendingStudentsList.push(latestBill);
      }
    });
    const pendingStudentsCount = pendingStudentsList.length;

    // --- KPI 4: Online vs Cash Ratio ---
    let cashCount = 0;
    let onlineCount = 0;
    allPayments.forEach((p) => {
      const mode = String(p.payment_mode || "").toLowerCase();
      if (mode === "cash") {
        cashCount += 1;
      } else {
        onlineCount += 1;
      }
    });
    const totalPaymentsCount = allPayments.length;
    const onlinePercentage =
      totalPaymentsCount > 0 ? Math.round((onlineCount / totalPaymentsCount) * 100) : 0;
    const dominantMode =
      totalPaymentsCount === 0
        ? "No collections recorded"
        : onlineCount >= cashCount
          ? `${onlinePercentage}% Online`
          : `${100 - onlinePercentage}% Cash`;

    // --- Recent Transactions (formatted for frontend display) ---
    const recentTransactions = allPayments.slice(0, 25).map((p) => {
      const bill = p.fee_bills;
      const student = bill?.students;

      const studentName = student?.name || "Student";
      const studentClass = student?.class
        ? `Class ${student.class}${student.section ? `-${student.section}` : ""}`
        : "Class --";

      // Format date
      let dateDisplay = "";
      if (p.payment_date) {
        const d = new Date(p.payment_date);
        dateDisplay = !isNaN(d.getTime())
          ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
          : p.payment_date;
      } else if (p.created_at) {
        const d = new Date(p.created_at);
        dateDisplay = !isNaN(d.getTime())
          ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
          : "";
      }

      const receiptId = p.receipt_no || bill?.receipt_number || `REC-${p.id.slice(0, 8).toUpperCase()}`;

      return {
        id: receiptId,
        payment_id: p.id,
        bill_id: p.bill_id,
        student: studentName,
        class: studentClass,
        roll_no: student?.roll_no || "",
        amount: `₹${Number(p.amount_paid || 0).toLocaleString("en-IN")}`,
        amount_raw: Number(p.amount_paid || 0),
        mode: (p.payment_mode || "Cash").toUpperCase(),
        date: dateDisplay || "Recent",
        status: bill?.bill_status === "paid" ? "Paid" : "Partial",
      };
    });

    // --- Class-wise Fee Realization (Using latest bill per student to avoid double counting) ---
    const classMap = {};
    studentLatestBillMap.forEach((b) => {
      const student = b.students;
      const rawClass = student?.class || "Other";
      const className = `Class ${rawClass}`;

      if (!classMap[className]) {
        classMap[className] = {
          name: className,
          rawClass,
          total_raw: 0,
          pending_raw: 0,
          collected_raw: 0,
        };
      }

      const due = b.bill_status === "paid" ? 0 : Number(b.net_payable || 0);
      classMap[className].pending_raw += due;
    });

    allPayments.forEach((p) => {
      const student = p.fee_bills?.students;
      const rawClass = student?.class || "Other";
      const className = `Class ${rawClass}`;
      if (classMap[className]) {
        classMap[className].collected_raw += Number(p.amount_paid || 0);
      }
    });

    const classWiseRealization = Object.values(classMap)
      .map((item) => {
        const totalRaw = item.collected_raw + item.pending_raw;
        const percent = totalRaw > 0 ? Math.round((item.collected_raw / totalRaw) * 100) : 0;
        return {
          name: item.name,
          percent,
          collected: `₹${item.collected_raw.toLocaleString("en-IN")}`,
          collected_raw: item.collected_raw,
          total: `₹${totalRaw.toLocaleString("en-IN")}`,
          total_raw: totalRaw,
          pending_raw: item.pending_raw,
          color:
            percent >= 80 ? "bg-emerald-500" : percent >= 50 ? "bg-blue-500" : "bg-amber-500",
        };
      })
      .sort((a, b) => b.total_raw - a.total_raw);

    // --- Pending Defaulters Alert (1 entry per student with exact latest balance) ---
    const today = new Date();
    const defaulters = pendingStudentsList
      .sort((a, b) => Number(b.net_payable || 0) - Number(a.net_payable || 0))
      .slice(0, 20)
      .map((b) => {
        const student = b.students;
        let daysOverdue = 0;
        if (b.due_date) {
          const due = new Date(b.due_date);
          daysOverdue = Math.max(0, Math.floor((today - due) / (1000 * 60 * 60 * 24)));
        } else if (b.created_at) {
          const created = new Date(b.created_at);
          daysOverdue = Math.max(0, Math.floor((today - created) / (1000 * 60 * 60 * 24)));
        }

        return {
          bill_id: b.id,
          student_id: b.student_id,
          student: student?.name || "Student",
          class: student?.class
            ? `Class ${student.class}${student.section ? `-${student.section}` : ""}`
            : "Class --",
          roll_no: student?.roll_no || "--",
          due: `₹${Number(b.net_payable || 0).toLocaleString("en-IN")}`,
          due_raw: Number(b.net_payable || 0),
          month: b.month,
          days_overdue: daysOverdue,
        };
      });

    return res.json({
      success: true,
      data: {
        kpis: {
          total_collected: totalCollected,
          collected_this_month: collectedThisMonth,
          transactions_this_month: transactionsCountThisMonth,
          pending_dues: totalPendingDues,
          pending_students_count: pendingStudentsCount,
          total_transactions: totalPaymentsCount,
          online_percentage: onlinePercentage,
          cash_percentage: 100 - onlinePercentage,
          dominant_mode: dominantMode,
        },
        recent_transactions: recentTransactions,
        class_wise_realization: classWiseRealization,
        defaulters,
      },
    });
  } catch (error) {
    console.error("Get Fee Dashboard Overview Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching dashboard data",
      error: error.message,
    });
  }
};

/**
 * GET /api/fees/cached-pdf/:bill_id
 * Returns cached PDF metadata if available
 */
export const getCachedBillPdfController = async (req, res) => {
  try {
    const { bill_id } = req.params;
    if (!bill_id) {
      return res.status(400).json({ success: false, message: "bill_id is required" });
    }
    const cached = getCachedBillPdf(bill_id);
    if (!cached || !cached.url) {
      return res.status(404).json({ success: false, message: "PDF not cached yet" });
    }
    return res.json({ success: true, ...cached });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/fees/cached-pdf/:bill_id
 * Uploads generated PDF base64 to Cloudinary/local storage and stores in cache
 */
export const saveCachedBillPdfController = async (req, res) => {
  try {
    const { bill_id } = req.params;
    const { pdfBase64, filename } = req.body || {};
    if (!bill_id || !pdfBase64) {
      return res.status(400).json({
        success: false,
        message: "bill_id and pdfBase64 are required",
      });
    }

    const cleanBase64 = String(pdfBase64).replace(/^data:application\/pdf;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const safeFilename = filename || `fee-receipt-${bill_id.slice(0, 8)}`;

    const uploadResult = await uploadPdfBuffer(buffer, {
      filename: safeFilename,
      folder: "bills",
    });

    const saved = setCachedBillPdf(bill_id, {
      url: uploadResult.url,
      provider: uploadResult.provider,
      filename: `${safeFilename}.pdf`,
    });

    return res.json({ success: true, ...saved });
  } catch (err) {
    console.error("Error saving cached bill PDF:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};


