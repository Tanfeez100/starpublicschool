import { randomUUID } from "crypto";
import { supabase } from "../services/supabase.js";
import { generateInvoicePDF } from "../services/pdfGenerator.js";
import { sendReceiptOnWhatsApp } from "../services/whatsappService.js";
import { sendFeePaymentSms } from "../services/twilioSmsService.js";
import {
  fetchBillPaymentsByBillIds,
  loadBillNotificationContext,
  sendStudentPushNotification,
} from "../services/studentNotificationService.js";

const toSafeString = (value) => String(value ?? "").trim();
const toAmount = (value) => Number.parseFloat(value || 0) || 0;

const normalizeClassToken = (value) =>
  toSafeString(value)
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/\./g, "");

const normalizeDigits = (value) => toSafeString(value).replace(/\D/g, "");
const normalizeLoose = (value) => toSafeString(value).toLowerCase().replace(/\s+/g, "");
const normalizeSectionToken = (value) => normalizeLoose(value).replace(/[^a-z0-9]/g, "");
const normalizeRollToken = (value) => {
  const digits = normalizeDigits(value);
  return digits ? String(Number.parseInt(digits, 10)) : normalizeLoose(value);
};

const amountsMatch = (a, b) => Math.abs(toAmount(a) - toAmount(b)) < 0.01;
const sanitizeCashfreeOrderId = (value) =>
  toSafeString(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 45);

const getCashfreeMode = () => {
  const secretKey = toSafeString(process.env.CASHFREE_SECRET_KEY);
  if (secretKey.includes("_test_")) {
    return "sandbox";
  }
  if (secretKey.includes("_prod_")) {
    return "production";
  }

  const configuredMode = normalizeLoose(process.env.CASHFREE_ENV || process.env.CASHFREE_MODE);
  if (configuredMode) {
    return configuredMode === "production" || configuredMode === "prod" ? "production" : "sandbox";
  }

  return "sandbox";
};

const getCashfreeBaseUrl = () =>
  process.env.CASHFREE_BASE_URL ||
  (getCashfreeMode() === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg");

const getCashfreeCredentials = () => {
  const clientId = toSafeString(process.env.CASHFREE_APP_ID || process.env.CASHFREE_CLIENT_ID);
  const clientSecret = toSafeString(process.env.CASHFREE_SECRET_KEY || process.env.CASHFREE_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    throw new Error("Cashfree credentials are not configured");
  }

  return { clientId, clientSecret };
};

const cashfreeRequest = async (path, { method = "GET", body, idempotencyKey } = {}) => {
  const { clientId, clientSecret } = getCashfreeCredentials();
  const headers = {
    "Content-Type": "application/json",
    "x-api-version": process.env.CASHFREE_API_VERSION || "2025-01-01",
    "x-client-id": clientId,
    "x-client-secret": clientSecret,
  };

  if (idempotencyKey) {
    headers["x-idempotency-key"] = idempotencyKey;
  }

  const response = await fetch(`${getCashfreeBaseUrl()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text ? { message: text } : null;
  }

  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || "Cashfree request failed";
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    error.cashfreeMode = getCashfreeMode();
    error.cashfreeBaseUrl = getCashfreeBaseUrl();
    throw error;
  }

  return data;
};

const normalizeClassForCompare = (value) => {
  const text = normalizeLoose(value).replace(/\./g, "");
  if (!text) return "";

  const classWordMatch = text.match(/^class(.+)$/);
  const core = classWordMatch ? classWordMatch[1] : text;
  if (core.replace(/[\s-]+/g, "") === "mothercare" || core === "nursery") {
    return "NURSERY";
  }
  const numericMatch = core.match(/^0*(\d+)(st|nd|rd|th)?$/);
  if (numericMatch) return String(Number.parseInt(numericMatch[1], 10));

  return core.toUpperCase();
};

const mobileMatches = (stored, submitted) => {
  const storedDigits = normalizeDigits(stored);
  const submittedDigits = normalizeDigits(submitted);
  if (!storedDigits || !submittedDigits) return false;
  return (
    storedDigits === submittedDigits ||
    storedDigits.endsWith(submittedDigits.slice(-10)) ||
    submittedDigits.endsWith(storedDigits.slice(-10))
  );
};

const resolvePublicStudent = async ({ className, section, rollNumber, mobile }) => {
  const rollToken = normalizeRollToken(rollNumber);
  const providedMobile = normalizeDigits(mobile);

  const { data, error } = await supabase
    .from("students")
    .select("id, name, father_name, roll_no, class, section, academic_year, mobile, status")
    .eq("status", "active")
    .eq("roll_no", rollToken)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const candidates = (data || []).filter(
    (student) =>
      normalizeClassForCompare(student.class) === normalizeClassForCompare(className) &&
      normalizeSectionToken(student.section) === normalizeSectionToken(section)
  );

  if (!candidates.length) {
    return null;
  }

  if (providedMobile) {
    return candidates.find((student) => mobileMatches(student.mobile, mobile)) || null;
  }

  return candidates[0] || null;
};

const buildInvoiceData = async (billId) => {
  const { data: bill, error: billError } = await supabase
    .from("fee_bills")
    .select(
      `
      *,
      students (
        id,
        name,
        father_name,
        roll_no,
        class,
        section,
        mobile,
        aadhaar_card,
        photo_url
      )
    `
    )
    .eq("id", billId)
    .single();

  if (billError || !bill) {
    return { invoiceData: null, error: billError || new Error("Bill not found") };
  }

  const [{ data: items, error: itemsError }, { data: payments, error: paymentsError }] =
    await Promise.all([
      supabase
        .from("fee_bill_items")
        .select("*")
        .eq("bill_id", billId)
        .order("created_at", { ascending: true }),
      supabase
        .from("fee_payments")
        .select("*")
        .eq("bill_id", billId)
        .order("payment_date", { ascending: false }),
    ]);

  if (itemsError || paymentsError) {
    return { invoiceData: null, error: itemsError || paymentsError };
  }

  const totalPaid =
    payments?.reduce((sum, payment) => sum + toAmount(payment.amount_paid), 0) || 0;
  const remaining = Math.max(0, toAmount(bill.total_amount) - totalPaid);

  return {
    invoiceData: {
      invoice_number: `INV-${bill.id.substring(0, 8).toUpperCase()}`,
      date: bill.created_at,
      month: bill.month,
      student: bill.students,
      items: items || [],
      payments: payments || [],
      total_amount: toAmount(bill.total_amount),
      total_paid: totalPaid,
      remaining,
      status: remaining === 0 ? "paid" : totalPaid > 0 ? "partial" : "unpaid",
      bill_id: bill.id,
    },
    error: null,
  };
};

const enrichBill = async (bill) => {
  const [{ data: items }] = await Promise.all([
    supabase.from("fee_bill_items").select("fee_name, amount").eq("bill_id", bill.id),
  ]);

  const payments = await fetchBillPaymentsByBillIds([bill.id]);

  const totalPaid =
    payments?.reduce((sum, payment) => sum + toAmount(payment.amount_paid), 0) || 0;
  const totalAmount = toAmount(bill.total_amount);
  const netPayable = Math.max(0, totalAmount - totalPaid);

  return {
    bill_id: bill.id,
    month: bill.month,
    status: netPayable === 0 ? "paid" : totalPaid > 0 ? "partial" : bill.bill_status || "unpaid",
    items: items || [],
    payments: payments || [],
    total_amount: totalAmount,
    total_paid: totalPaid,
    net_payable: Number(netPayable.toFixed(2)),
  };
};

const getSuccessfulCashfreePayment = async (orderId, paymentId) => {
  if (paymentId) {
    return cashfreeRequest(
      `/orders/${encodeURIComponent(orderId)}/payments/${encodeURIComponent(paymentId)}`
    );
  }

  const payments = await cashfreeRequest(`/orders/${encodeURIComponent(orderId)}/payments`);
  return (
    (payments || []).find(
      (payment) => payment.payment_status === "SUCCESS" && payment.is_captured !== false
    ) ||
    (payments || []).find((payment) => payment.payment_status === "PENDING") ||
    null
  );
};

const completeCapturedPublicPayment = async ({
  req,
  orderId,
  paymentId,
  billId,
  mobile,
}) => {
  const [order, cashfreePayment] = await Promise.all([
    cashfreeRequest(`/orders/${encodeURIComponent(orderId)}`),
    getSuccessfulCashfreePayment(orderId, paymentId),
  ]);

  if (!cashfreePayment) {
    return {
      status: "pending",
      message: "Payment is still pending",
      order_status: order?.order_status || "ACTIVE",
    };
  }

  if (order?.order_tags?.bill_id && order.order_tags.bill_id !== billId) {
    return { status: "failed", message: "Payment order does not match this bill" };
  }

  if (cashfreePayment.order_id !== orderId) {
    return { status: "failed", message: "Payment does not match this order" };
  }

  if (cashfreePayment.payment_status !== "SUCCESS" || cashfreePayment.is_captured === false) {
    return {
      status: "pending",
      message: `Payment status is ${cashfreePayment.payment_status || order?.order_status || "pending"}`,
      order_status: order?.order_status || "ACTIVE",
    };
  }

  if (order?.order_status !== "PAID") {
    return {
      status: "pending",
      message: `Order status is ${order?.order_status || "pending"}`,
      order_status: order?.order_status || "ACTIVE",
    };
  }

  if (cashfreePayment.payment_currency !== "INR" || order.order_currency !== "INR") {
    return { status: "failed", message: "Payment currency mismatch" };
  }

  if (!amountsMatch(cashfreePayment.payment_amount, order.order_amount)) {
    return { status: "failed", message: "Payment amount does not match the order amount" };
  }

  const { invoiceData, error } = await buildInvoiceData(billId);
  if (error || !invoiceData) {
    return { status: "failed", message: "Bill not found" };
  }

  if (normalizeDigits(mobile) && !mobileMatches(invoiceData.student?.mobile, mobile)) {
    return { status: "failed", message: "Mobile number does not match this bill" };
  }

  if (invoiceData.remaining > 0 && !amountsMatch(order.order_amount, invoiceData.remaining)) {
    return { status: "failed", message: "Payment amount does not match current bill payable amount" };
  }

  const transactionId = String(cashfreePayment.cf_payment_id);
  const existingPayment = await supabase
    .from("fee_payments")
    .select("*")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  let payment = existingPayment.data || null;
  let createdPayment = false;

  if (existingPayment.error && existingPayment.error.code !== "PGRST116") {
    console.error("Existing public payment lookup failed:", existingPayment.error);
  }

  if (!payment) {
    const amountPaid = toAmount(cashfreePayment.payment_amount || order.order_amount);
    const { data: rpcData, error: rpcError } = await supabase.rpc("fn_process_payment", {
      p_student_id: invoiceData.student.id,
      p_bill_id: billId,
      p_amount: amountPaid,
      p_payment_mode: "online",
      p_payment_date: new Date().toISOString().slice(0, 10),
      p_month: invoiceData.month,
      p_transaction_id: transactionId,
    });

    if (rpcError) {
      console.error("Public payment RPC error:", rpcError);
      return { status: "failed", message: rpcError.message || "Payment recording failed" };
    }

    payment = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    createdPayment = true;
  }

  const publicBaseUrl =
    process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get("host")}`;
  const receiptUrl = `${publicBaseUrl}/api/public-fees/receipt/${billId}${
    mobile ? `?mobile=${encodeURIComponent(mobile)}` : ""
  }`;

  let whatsapp = { sent: false, skipped: true };
  if (createdPayment && normalizeDigits(mobile)) {
    try {
      whatsapp = await sendReceiptOnWhatsApp({
        mobile,
        studentName: invoiceData.student?.name,
        receiptUrl,
        invoiceNumber: invoiceData.invoice_number,
        amount: toAmount(cashfreePayment.payment_amount || order.order_amount),
      });
    } catch (whatsappError) {
      console.error("WhatsApp receipt send failed:", whatsappError);
      whatsapp = { sent: false, error: whatsappError.message };
    }
  }

  let sms = { sent: false, skipped: true };
  const registeredMobile = invoiceData.student?.mobile;
  const amountPaid = toAmount(cashfreePayment.payment_amount || order.order_amount);
  if (normalizeDigits(registeredMobile)) {
    try {
      const refreshedInvoice = await buildInvoiceData(billId);
      const latestInvoiceData = refreshedInvoice.invoiceData || invoiceData;
      sms = await sendFeePaymentSms({
        mobile: registeredMobile,
        studentName: latestInvoiceData.student?.name,
        invoiceNumber: latestInvoiceData.invoice_number,
        month: latestInvoiceData.month,
        dueBeforePayment: invoiceData.remaining,
        amountPaid,
        remaining: latestInvoiceData.remaining,
        receiptUrl,
      });
    } catch (smsError) {
      console.error("Twilio fee payment SMS failed:", smsError);
      sms = {
        sent: false,
        error: smsError.message,
        code: smsError.code,
        more_info: smsError.moreInfo,
      };
    }
  } else {
    sms = {
      sent: false,
      skipped: true,
      reason: "Student registered mobile number is missing",
    };
  }

  let push = { sent: false, skipped: true };
  if (createdPayment) {
    try {
      const latestBillContext = await loadBillNotificationContext(billId);
      const paymentAmount = toAmount(cashfreePayment.payment_amount || order.order_amount);
      push = await sendStudentPushNotification({
        studentId: latestBillContext.student?.id,
        title: `Fee payment recorded for ${latestBillContext.month}`,
        body: `${latestBillContext.student?.name || "Student"} | Paid Rs. ${paymentAmount.toFixed(2)} via ONLINE | Remaining Rs. ${latestBillContext.summary.remaining.toFixed(2)}`,
        notificationType: "fee_payment",
        sourceType: "fee_payments",
        sourceId: billId,
        data: {
          ...latestBillContext,
          payment: {
            amount_paid: paymentAmount,
            payment_mode: "online",
            payment_date: new Date().toISOString().slice(0, 10),
            transaction_id: transactionId,
            receipt_url: receiptUrl,
          },
        },
      });
    } catch (pushError) {
      console.error("Student push payment notification failed:", pushError);
      push = { sent: false, error: pushError.message };
    }
  }

  return {
    status: "paid",
    message: "Payment verified and recorded successfully",
    payment,
    gateway: "cashfree",
    cashfree_order_id: orderId,
    cashfree_payment_id: transactionId,
    bill_id: billId,
    receipt_url: receiptUrl,
    push,
    whatsapp,
    sms,
  };
};

export const lookupPublicFees = async (req, res) => {
  try {
    const { class: className, section, roll_number, month, mobile } = req.body;

    if (!className || !section || !roll_number || !month) {
      return res.status(400).json({
        message: "class, section, roll_number and month are required",
      });
    }

    if (!/^\d{4}-\d{2}$/.test(toSafeString(month))) {
      return res.status(400).json({ message: "Invalid month format. Use YYYY-MM" });
    }

    const student = await resolvePublicStudent({
      className,
      section,
      rollNumber: roll_number,
      mobile,
    });

    if (!student) {
      return res.status(404).json({
        message:
          "Student not found. Please check class, roll, section and mobile number (if provided).",
      });
    }

    const { data: bills, error: billsError } = await supabase
      .from("fee_bills")
      .select("id, month, total_amount, bill_status, created_at")
      .eq("student_id", student.id)
      .eq("month", toSafeString(month))
      .order("month", { ascending: false });

    if (billsError) throw billsError;

    const enrichedBills = await Promise.all((bills || []).map(enrichBill));
    const activeBill = enrichedBills[0] || null;

    return res.json({
      message: "Fee status fetched successfully",
      student: {
        id: student.id,
        name: student.name,
        father_name: student.father_name,
        roll_no: student.roll_no,
        class: student.class,
        section: student.section,
        session: student.academic_year,
      },
      active_bill: activeBill,
      bills: enrichedBills,
      cashfree_mode: getCashfreeMode(),
    });
  } catch (error) {
    console.error("Public fee lookup error:", error);
    return res.status(500).json({ message: "Failed to fetch fee status", error: error.message });
  }
};

export const createPublicFeeOrder = async (req, res) => {
  try {
    const { bill_id, mobile } = req.body;

    if (!bill_id) {
      return res.status(400).json({ message: "bill_id is required" });
    }

    const { invoiceData, error } = await buildInvoiceData(bill_id);
    if (error || !invoiceData) {
      return res.status(404).json({ message: "Bill not found" });
    }

    const normalizedMobile = normalizeDigits(mobile);
    const registeredMobile = normalizeDigits(invoiceData.student?.mobile);
    if (normalizedMobile && !mobileMatches(invoiceData.student?.mobile, mobile)) {
      return res.status(403).json({ message: "Mobile number does not match this bill" });
    }

    const paymentMobile = normalizedMobile || registeredMobile;
    if (!paymentMobile || paymentMobile.length < 10) {
      return res.status(400).json({
        message: "Student registered mobile number is required to create payment order",
      });
    }

    if (invoiceData.remaining <= 0) {
      return res.status(400).json({ message: "This bill is already paid" });
    }

    const orderId = sanitizeCashfreeOrderId(`GPS_${bill_id.slice(0, 8)}_${Date.now()}`);
    const publicFrontendUrl = process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || "";

    const customerDetails = {
      customer_id: sanitizeCashfreeOrderId(invoiceData.student?.id || bill_id),
      customer_name: invoiceData.student?.name || "Student",
      customer_phone: paymentMobile.slice(-10),
    };

    const orderBody = {
      order_id: orderId,
      order_amount: Number(invoiceData.remaining.toFixed(2)),
      order_currency: "INR",
      customer_details: customerDetails,
      order_meta: publicFrontendUrl
        ? {
            return_url: `${publicFrontendUrl.replace(/\/$/, "")}/pay-fees?cashfree_order_id={order_id}`,
          }
        : undefined,
      order_note: `Fee payment ${invoiceData.month}`,
      order_tags: {
        bill_id,
        student_id: invoiceData.student?.id || "",
        month: invoiceData.month,
      },
    };

    orderBody.order_tags.mobile = paymentMobile.slice(-10);

    const order = await cashfreeRequest("/orders", {
      method: "POST",
      idempotencyKey: randomUUID(),
      body: orderBody,
    });

    return res.json({
      message: "Payment order created",
      gateway: "cashfree",
      order: {
        id: order.order_id,
        cf_order_id: order.cf_order_id,
        amount: order.order_amount,
        currency: order.order_currency,
        status: order.order_status,
        payment_session_id: order.payment_session_id,
      },
      cashfree_mode: getCashfreeMode(),
      student: invoiceData.student,
      bill: {
        bill_id,
        month: invoiceData.month,
        amount: invoiceData.remaining,
      },
    });
  } catch (error) {
    console.error("Create public fee order error:", error);
    const isCashfreeAuthError = /auth/i.test(error.message || "");
    return res.status(isCashfreeAuthError ? 401 : 500).json({
      message: "Failed to create payment order",
      error: error.message,
      cashfree_mode: error.cashfreeMode || getCashfreeMode(),
      hint: isCashfreeAuthError
        ? "Cashfree App ID and Secret Key must belong to the same Cashfree PG environment."
        : undefined,
    });
  }
};

export const verifyPublicFeePayment = async (req, res) => {
  try {
    const {
      cashfree_order_id,
      cf_payment_id,
      order_id,
      payment_id,
      bill_id,
      mobile,
    } = req.body;

    const cashfreeOrderId = cashfree_order_id || order_id;
    const cashfreePaymentId = cf_payment_id || payment_id;

    if (!cashfreeOrderId || !bill_id) {
      return res.status(400).json({ message: "Missing payment verification fields" });
    }

    const result = await completeCapturedPublicPayment({
      req,
      orderId: cashfreeOrderId,
      paymentId: cashfreePaymentId,
      billId: bill_id,
      mobile,
    });

    if (result.status === "failed") {
      return res.status(400).json({ message: result.message });
    }

    return res.json(result);
  } catch (error) {
    console.error("Verify public fee payment error:", error);
    return res.status(500).json({ message: "Failed to verify payment", error: error.message });
  }
};

export const getPublicFeePaymentStatus = async (req, res) => {
  try {
    const { order_id } = req.params;
    const { bill_id, mobile } = req.query;

    if (!order_id || !bill_id) {
      return res.status(400).json({ message: "order_id and bill_id are required" });
    }

    const result = await completeCapturedPublicPayment({
      req,
      orderId: order_id,
      billId: bill_id,
      mobile,
    });

    if (result.status === "failed") {
      return res.status(400).json({ message: result.message });
    }

    return res.json(result);
  } catch (error) {
    console.error("Public fee payment status error:", error);
    return res.status(500).json({ message: "Failed to check payment status", error: error.message });
  }
};

export const lookupPublicReceipt = async (req, res) => {
  try {
    const { class: className, section, roll_number, month, mobile } = req.body;

    if (!className || !section || !roll_number || !month) {
      return res.status(400).json({
        message: "class, section, roll_number and month are required",
      });
    }

    if (!/^\d{4}-\d{2}$/.test(toSafeString(month))) {
      return res.status(400).json({ message: "Invalid month format. Use YYYY-MM" });
    }

    const student = await resolvePublicStudent({
      className,
      section,
      rollNumber: roll_number,
      mobile,
    });

    if (!student) {
      return res.status(404).json({
        message: "Student not found. Please check class, roll, section and mobile number.",
      });
    }

    const { data: bill, error: billError } = await supabase
      .from("fee_bills")
      .select("id, month, total_amount, bill_status, created_at")
      .eq("student_id", student.id)
      .eq("month", toSafeString(month))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (billError) throw billError;

    if (!bill) {
      return res.status(404).json({ message: "No fee bill found for selected month" });
    }

    const enrichedBill = await enrichBill(bill);
    if (toAmount(enrichedBill.total_paid) <= 0) {
      return res.status(404).json({
        message: "Receipt is available only after payment is recorded for this month",
      });
    }

    const publicBaseUrl =
      process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get("host")}`;
    const receiptUrl = `${publicBaseUrl}/api/public-fees/receipt/${bill.id}${
      mobile ? `?mobile=${encodeURIComponent(mobile)}` : ""
    }`;

    return res.json({
      message: "Receipt found",
      receipt_url: receiptUrl,
      student: {
        id: student.id,
        name: student.name,
        father_name: student.father_name,
        roll_no: student.roll_no,
        class: student.class,
        section: student.section,
        session: student.academic_year,
      },
      bill: enrichedBill,
    });
  } catch (error) {
    console.error("Public receipt lookup error:", error);
    return res.status(500).json({ message: "Failed to find receipt", error: error.message });
  }
};

export const downloadPublicReceipt = async (req, res) => {
  try {
    const { bill_id } = req.params;
    const { mobile } = req.query;

    if (!bill_id) {
      return res.status(400).json({ message: "bill_id is required" });
    }

    const { invoiceData, error } = await buildInvoiceData(bill_id);
    if (error || !invoiceData) {
      return res.status(404).json({ message: "Bill not found" });
    }

    if (normalizeDigits(mobile) && !mobileMatches(invoiceData.student?.mobile, mobile)) {
      return res.status(403).json({ message: "Mobile number does not match this bill" });
    }

    const pdfBuffer = await generateInvoicePDF(invoiceData);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="fee-receipt-${invoiceData.invoice_number}.pdf"`
    );
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Public receipt download error:", error);
    return res.status(500).json({ message: "Failed to generate receipt", error: error.message });
  }
};
