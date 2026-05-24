import crypto from "crypto";
import Razorpay from "razorpay";
import { supabase } from "../services/supabase.js";
import { generateInvoicePDF } from "../services/pdfGenerator.js";
import { sendReceiptOnWhatsApp } from "../services/whatsappService.js";

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

const normalizeClassForCompare = (value) => {
  const text = normalizeLoose(value).replace(/\./g, "");
  if (!text) return "";

  const classWordMatch = text.match(/^class(.+)$/);
  const core = classWordMatch ? classWordMatch[1] : text;
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

const getRazorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys are not configured");
  }

  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
};

const resolvePublicStudent = async ({ className, section, rollNumber, mobile }) => {
  const rollToken = normalizeRollToken(rollNumber);

  const { data, error } = await supabase
    .from("students")
    .select("id, name, father_name, roll_no, class, section, academic_year, mobile, status")
    .eq("status", "active")
    .eq("roll_no", rollToken)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (
    (data || []).find(
      (student) =>
        normalizeClassForCompare(student.class) === normalizeClassForCompare(className) &&
        normalizeSectionToken(student.section) === normalizeSectionToken(section) &&
        mobileMatches(student.mobile, mobile)
    ) || null
  );
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
        mobile
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
  const [{ data: items }, { data: payments }] = await Promise.all([
    supabase.from("fee_bill_items").select("fee_name, amount").eq("bill_id", bill.id),
    supabase
      .from("fee_payments")
      .select("amount_paid, payment_mode, payment_date, transaction_id, receipt_no")
      .eq("bill_id", bill.id),
  ]);

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

export const lookupPublicFees = async (req, res) => {
  try {
    const { class: className, section, roll_number, month, mobile } = req.body;

    if (!className || !section || !roll_number || !month || !mobile) {
      return res.status(400).json({
        message: "class, section, roll_number, month and mobile are required",
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
      razorpay_key_id: process.env.RAZORPAY_KEY_ID || "",
    });
  } catch (error) {
    console.error("Public fee lookup error:", error);
    return res.status(500).json({ message: "Failed to fetch fee status", error: error.message });
  }
};

export const createPublicFeeOrder = async (req, res) => {
  try {
    const { bill_id, mobile } = req.body;

    if (!bill_id || !mobile) {
      return res.status(400).json({ message: "bill_id and mobile are required" });
    }

    const { invoiceData, error } = await buildInvoiceData(bill_id);
    if (error || !invoiceData) {
      return res.status(404).json({ message: "Bill not found" });
    }

    if (!mobileMatches(invoiceData.student?.mobile, mobile)) {
      return res.status(403).json({ message: "Mobile number does not match this bill" });
    }

    if (invoiceData.remaining <= 0) {
      return res.status(400).json({ message: "This bill is already paid" });
    }

    const razorpay = getRazorpayClient();
    const amountInPaise = Math.round(invoiceData.remaining * 100);
    const receipt = `GPS-${bill_id.slice(0, 8)}-${Date.now().toString().slice(-8)}`;
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        bill_id,
        student_id: invoiceData.student?.id || "",
        mobile: normalizeDigits(mobile).slice(-10),
      },
    });

    return res.json({
      message: "Payment order created",
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      },
      razorpay_key_id: process.env.RAZORPAY_KEY_ID,
      student: invoiceData.student,
      bill: {
        bill_id,
        month: invoiceData.month,
        amount: invoiceData.remaining,
      },
    });
  } catch (error) {
    console.error("Create public fee order error:", error);
    return res.status(500).json({ message: "Failed to create payment order", error: error.message });
  }
};

export const verifyPublicFeePayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bill_id,
      mobile,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !bill_id || !mobile) {
      return res.status(400).json({ message: "Missing payment verification fields" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ message: "Payment signature verification failed" });
    }

    const razorpay = getRazorpayClient();
    const [order, razorpayPayment] = await Promise.all([
      razorpay.orders.fetch(razorpay_order_id),
      razorpay.payments.fetch(razorpay_payment_id),
    ]);

    if (order?.notes?.bill_id && order.notes.bill_id !== bill_id) {
      return res.status(400).json({ message: "Payment order does not match this bill" });
    }

    if (razorpayPayment?.order_id !== razorpay_order_id || razorpayPayment?.status !== "captured") {
      return res.status(400).json({ message: "Razorpay payment is not captured yet" });
    }

    const { invoiceData, error } = await buildInvoiceData(bill_id);
    if (error || !invoiceData) {
      return res.status(404).json({ message: "Bill not found" });
    }

    if (!mobileMatches(invoiceData.student?.mobile, mobile)) {
      return res.status(403).json({ message: "Mobile number does not match this bill" });
    }

    const amountPaid = Number(razorpayPayment.amount || order.amount || 0) / 100;

    const { data: rpcData, error: rpcError } = await supabase.rpc("fn_process_payment", {
      p_student_id: invoiceData.student.id,
      p_bill_id: bill_id,
      p_amount: amountPaid,
      p_payment_mode: "online",
      p_payment_date: new Date().toISOString().slice(0, 10),
      p_month: invoiceData.month,
      p_transaction_id: razorpay_payment_id,
    });

    if (rpcError) {
      console.error("Public payment RPC error:", rpcError);
      return res.status(400).json({ message: rpcError.message || "Payment recording failed" });
    }

    const payment = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    const publicBaseUrl =
      process.env.PUBLIC_BACKEND_URL || `${req.protocol}://${req.get("host")}`;
    const receiptUrl = `${publicBaseUrl}/api/public-fees/receipt/${bill_id}?mobile=${encodeURIComponent(
      mobile
    )}`;

    let whatsapp = { sent: false, skipped: true };
    try {
      whatsapp = await sendReceiptOnWhatsApp({
        mobile,
        studentName: invoiceData.student?.name,
        receiptUrl,
        invoiceNumber: invoiceData.invoice_number,
        amount: amountPaid,
      });
    } catch (whatsappError) {
      console.error("WhatsApp receipt send failed:", whatsappError);
      whatsapp = { sent: false, error: whatsappError.message };
    }

    return res.json({
      message: "Payment verified and recorded successfully",
      payment,
      bill_id,
      receipt_url: receiptUrl,
      whatsapp,
    });
  } catch (error) {
    console.error("Verify public fee payment error:", error);
    return res.status(500).json({ message: "Failed to verify payment", error: error.message });
  }
};

export const downloadPublicReceipt = async (req, res) => {
  try {
    const { bill_id } = req.params;
    const { mobile } = req.query;

    if (!bill_id || !mobile) {
      return res.status(400).json({ message: "bill_id and mobile are required" });
    }

    const { invoiceData, error } = await buildInvoiceData(bill_id);
    if (error || !invoiceData) {
      return res.status(404).json({ message: "Bill not found" });
    }

    if (!mobileMatches(invoiceData.student?.mobile, mobile)) {
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
