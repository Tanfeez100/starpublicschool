import { supabase } from "../services/supabase.js";
import { fetchBillPaymentsByBillIds } from "../services/studentNotificationService.js";

const getSafeYear = (value) => {
  const normalized = String(value || "").replace(/\D/g, "").slice(0, 4);
  if (normalized.length === 4) return normalized;
  return String(new Date().getFullYear());
};

const toNumber = (value) => Number.parseFloat(value || 0) || 0;

const sumAmounts = (rows = [], field = "amount") =>
  rows.reduce((sum, row) => sum + toNumber(row?.[field]), 0);

const getLatestPayment = (payments = []) =>
  [...payments].sort((a, b) => String(b.payment_date || "").localeCompare(String(a.payment_date || "")))[0] || null;

export const getMyFeeDashboard = async (req, res) => {
  try {
    const studentId = req.user?.id;
    const year = getSafeYear(req.query.year);

    if (!studentId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, name, father_name, mobile, class, section, roll_no, academic_year, status, username, date_of_birth, photo_url")
      .eq("id", studentId)
      .maybeSingle();

    if (studentError) {
      return res.status(500).json({ success: false, message: studentError.message });
    }

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const { data: yearsRows, error: yearsError } = await supabase
      .from("fee_bills")
      .select("year")
      .eq("student_id", studentId)
      .order("year", { ascending: false });

    if (yearsError) {
      return res.status(500).json({ success: false, message: yearsError.message });
    }

    const yearOptions = [
      ...new Set(
        (yearsRows || [])
          .map((row) => String(row.year || "").trim())
          .filter((value) => /^\d{4}$/.test(value)),
      ),
    ];

    if (!yearOptions.includes(year)) {
      yearOptions.unshift(year);
    }

    const { data: bills, error: billsError } = await supabase
      .from("fee_bills")
      .select("id, student_id, month, year, total_amount, net_payable, bill_status, created_at, updated_at")
      .eq("student_id", studentId)
      .like("month", `${year}-%`)
      .order("month", { ascending: false });

    if (billsError) {
      return res.status(500).json({ success: false, message: billsError.message });
    }

    const billIds = (bills || []).map((bill) => bill.id);
    const [itemsResult, advancesResult, paymentsResult] = await Promise.all([
      billIds.length
        ? supabase
            .from("fee_bill_items")
            .select("bill_id, fee_name, amount")
            .in("bill_id", billIds)
        : Promise.resolve({ data: [], error: null }),
      billIds.length
        ? supabase
            .from("advance_ledger")
            .select("used_for_bill_id, amount")
            .eq("status", "used")
            .in("used_for_bill_id", billIds)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("fee_payments")
        .select("id, bill_id, amount_paid, payment_mode, payment_date, created_at")
        .gte("payment_date", `${year}-01-01`)
        .lte("payment_date", `${year}-12-31`)
        .order("payment_date", { ascending: false }),
    ]);

    const itemError = itemsResult?.error || null;
    const advanceError = advancesResult?.error || null;
    const paymentError = paymentsResult?.error || null;

    if (itemError || advanceError || paymentError) {
      return res.status(500).json({
        success: false,
        message: itemError?.message || advanceError?.message || paymentError?.message,
      });
    }

    const payments = await fetchBillPaymentsByBillIds(billIds);
    const itemsByBill = {};
    (itemsResult.data || []).forEach((item) => {
      if (!itemsByBill[item.bill_id]) itemsByBill[item.bill_id] = [];
      itemsByBill[item.bill_id].push(item);
    });

    const paymentsByBill = {};
    (payments || []).forEach((payment) => {
      if (!paymentsByBill[payment.bill_id]) paymentsByBill[payment.bill_id] = [];
      paymentsByBill[payment.bill_id].push(payment);
    });

    const advanceByBill = {};
    (advancesResult.data || []).forEach((advance) => {
      const billId = advance.used_for_bill_id;
      if (!billId) return;
      advanceByBill[billId] = (advanceByBill[billId] || 0) + toNumber(advance.amount);
    });

    const history = (bills || []).map((bill) => {
      const items = itemsByBill[bill.id] || [];
      const payments = paymentsByBill[bill.id] || [];
      const advanceUsed = advanceByBill[bill.id] || 0;
      const basePayable = toNumber(bill.net_payable ?? bill.total_amount);
      const totalPaid = sumAmounts(payments, "amount_paid") + advanceUsed;
      const remaining = Math.max(0, basePayable - totalPaid);
      const latestPayment = getLatestPayment(payments);

      return {
        bill_id: bill.id,
        invoice_number: `INV-${bill.id.substring(0, 8).toUpperCase()}`,
        month: bill.month,
        year: bill.year,
        bill_status: bill.bill_status || "unpaid",
        total_amount: toNumber(bill.total_amount),
        net_payable: basePayable,
        paid_amount: totalPaid,
        remaining,
        advance_used: advanceUsed,
        items_count: items.length,
        payment_count: payments.length,
        latest_payment: latestPayment
          ? {
              payment_mode: latestPayment.payment_mode || null,
              payment_date: latestPayment.payment_date || null,
              amount_paid: toNumber(latestPayment.amount_paid),
              transaction_id: latestPayment.transaction_id || null,
              receipt_no: latestPayment.receipt_no || null,
            }
          : null,
        items: items.slice(0, 5),
        payments: payments.slice(0, 5),
      };
    });

    const historyByBill = new Map(history.map((bill) => [bill.bill_id, bill]));
    const paymentHistory = (payments || []).map((payment) => {
      const linkedHistory = historyByBill.get(payment.bill_id);
      const totalAmount = toNumber(linkedHistory?.total_amount ?? 0);
      const totalPaid = toNumber(linkedHistory?.paid_amount ?? 0);
      const remaining = toNumber(linkedHistory?.remaining ?? Math.max(0, totalAmount - totalPaid));

      return {
        id: payment.id,
        bill_id: payment.bill_id,
        invoice_number: linkedHistory?.invoice_number || null,
        month: linkedHistory?.month || String(payment.payment_date || "").slice(0, 7),
        payment_date: payment.payment_date || payment.created_at || null,
        amount_paid: toNumber(payment.amount_paid),
        payment_mode: payment.payment_mode || null,
        transaction_id: payment.transaction_id || null,
        receipt_no: payment.receipt_no || null,
        total_amount: totalAmount,
        net_payable: toNumber(linkedHistory?.net_payable ?? totalAmount),
        total_paid: totalPaid,
        remaining,
        bill_status: linkedHistory?.bill_status || "unpaid",
      };
    });

    const summary = history.reduce(
      (acc, bill) => {
        acc.total_amount += bill.total_amount;
        acc.total_paid += bill.paid_amount;
        acc.total_due += bill.remaining;
        acc.months += 1;
        if (bill.remaining <= 0) acc.paid += 1;
        else if (bill.paid_amount > 0) acc.partial += 1;
        else acc.unpaid += 1;
        return acc;
      },
      {
        total_amount: 0,
        total_paid: 0,
        total_due: 0,
        months: 0,
        paid: 0,
        partial: 0,
        unpaid: 0,
      },
    );

    return res.json({
      success: true,
      student,
      year,
      year_options: yearOptions,
      summary,
      history,
      payment_history: paymentHistory,
      count: history.length,
    });
  } catch (error) {
    console.error("Get my fee dashboard error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to load fee dashboard",
    });
  }
};
