import { supabase } from "../services/supabase.js";
import { generateInvoiceNumber } from "../utils/invoiceNumber.js";

/* ======================================================
   1️⃣ GET FEES LIST
   ====================================================== */
export const getFees = async (req, res) => {
  const { month, status } = req.query;

  let q = supabase
    .from("fees")
    .select(`
      *,
      students (
        name,
        class,
        section,
        roll_no,
        mobile,
        address
      )
    `)
    .order("created_at", { ascending: false });

  if (month) q = q.eq("month", month);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ message: error.message });

  res.json(data || []);
};

/* ======================================================
   2️⃣ HELPER: PREVIOUS DUE
   ====================================================== */
const getPreviousDueInternal = async (studentId) => {
  const { data } = await supabase
    .from("previous_dues")
    .select("remaining_due")
    .eq("student_id", studentId)
    .eq("cleared", false);

  return (data || []).reduce(
    (sum, d) => sum + Number(d.remaining_due || 0),
    0
  );
};

/* ======================================================
   3️⃣ GENERATE SINGLE MONTH FEE
   ====================================================== */
export const generateFee = async (req, res) => {
  const { student_id, month } = req.body;

  try {
    // prevent duplicate
    const { data: existing } = await supabase
      .from("fees")
      .select("id")
      .eq("student_id", student_id)
      .eq("month", month)
      .single();

    if (existing) {
      return res.status(400).json({ message: "Fee already generated" });
    }

    const { data: student } = await supabase
      .from("students")
      .select("class, uses_transport")
      .eq("id", student_id)
      .single();

    const { data: fs } = await supabase
      .from("fee_structure")
      .select("*")
      .eq("class", student.class)
      .single();

    const previousDue = await getPreviousDueInternal(student_id);

    const tuition = Number(fs.tuition_fee || 0);
    const exam = Number(fs.exam_fee || 0);
    const annual = Number(fs.annual_fee || 0);
    const transport = student.uses_transport
      ? Number(fs.transport_fee || 0)
      : 0;

    const currentFee = tuition + exam + annual + transport;
    const totalFee = currentFee + previousDue;

    const breakdown = {
      "Tuition Fee": tuition,
      "Exam Fee": exam,
      "Annual Fee": annual,
    };

    if (transport > 0) breakdown["Transport Fee"] = transport;
    if (previousDue > 0) breakdown["Previous Due"] = previousDue;

    const invoice_no = await generateInvoiceNumber();

    await supabase.from("fees").insert({
      student_id,
      month,
      invoice_no,
      tuition_fee: tuition,
      exam_fee: exam,
      annual_fee: annual,
      transport_fee: transport,
      previous_due: previousDue,
      total_fee: totalFee,
      paid_amount: 0,
      due_amount: totalFee,
      status: "DUE",
      breakdown,
    });

    res.json({ success: true, totalFee, invoice_no });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ======================================================
   4️⃣ BULK GENERATE FEES (PREVIEW / SAVE)
   ====================================================== */
export const generateBulkFees = async (req, res) => {
  const { className, month, preview = false } = req.body;

  if (!className || !month) {
    return res.status(400).json({ message: "className & month required" });
  }

  try {
    const { data: students } = await supabase
      .from("students")
      .select("id, name, class, section, roll_no, uses_transport")
      .eq("class", className)
      .order("roll_no");

    if (!students?.length) return res.json([]);

    const { data: fs } = await supabase
      .from("fee_structure")
      .select("*")
      .eq("class", className)
      .single();

    const invoices = [];

    for (const student of students) {
      const previousDue = await getPreviousDueInternal(student.id);

      const tuition = Number(fs.tuition_fee || 0);
      const exam = Number(fs.exam_fee || 0);
      const annual = Number(fs.annual_fee || 0);
      const transport = student.uses_transport
        ? Number(fs.transport_fee || 0)
        : 0;

      const totalFee =
        tuition + exam + annual + transport + previousDue;

      const breakdown = {
        "Tuition Fee": tuition,
        "Exam Fee": exam,
        "Annual Fee": annual,
      };

      if (transport > 0) breakdown["Transport Fee"] = transport;
      if (previousDue > 0) breakdown["Previous Due"] = previousDue;

      const invoice = {
        student,
        month,
        totalFee,
        breakdown,
      };

      if (!preview) {
        invoice.invoice_no = await generateInvoiceNumber();

        await supabase.from("fees").upsert(
          {
            student_id: student.id,
            month,
            invoice_no: invoice.invoice_no,
            tuition_fee: tuition,
            exam_fee: exam,
            annual_fee: annual,
            transport_fee: transport,
            previous_due: previousDue,
            total_fee: totalFee,
            paid_amount: 0,
            due_amount: totalFee,
            status: "DUE",
            breakdown,
          },
          { onConflict: "student_id,month" }
        );
      }

      invoices.push(invoice);
    }

    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ======================================================
   5️⃣ CLOSE MONTH
   ====================================================== */
export const closeMonth = async (req, res) => {
  const { fromMonth, toMonth } = req.body;

  const { error } = await supabase.rpc("close_month_dues", {
    from_month: fromMonth,
    to_month: toMonth,
  });

  if (error) return res.status(500).json({ message: error.message });

  res.json({ success: true });
};

/* ======================================================
   6️⃣ PAY FEE
   ====================================================== */
export const payFee = async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  let remaining = Number(amount);

  try {
    const { data: fee } = await supabase
      .from("fees")
      .select("student_id, paid_amount, total_fee")
      .eq("id", id)
      .single();

    const { data: dues } = await supabase
      .from("previous_dues")
      .select("*")
      .eq("student_id", fee.student_id)
      .eq("cleared", false)
      .order("created_at");

    for (const due of dues) {
      if (remaining <= 0) break;

      if (remaining >= due.remaining_due) {
        remaining -= due.remaining_due;
        await supabase
          .from("previous_dues")
          .update({ remaining_due: 0, cleared: true })
          .eq("id", due.id);
      } else {
        await supabase
          .from("previous_dues")
          .update({
            remaining_due: due.remaining_due - remaining,
          })
          .eq("id", due.id);
        remaining = 0;
      }
    }

    const newPaid = Number(fee.paid_amount || 0) + remaining;
    let status = "DUE";
    if (newPaid >= fee.total_fee) status = "PAID";
    else if (newPaid > 0) status = "PARTIAL";

    await supabase
      .from("fees")
      .update({ paid_amount: newPaid, status })
      .eq("id", id);

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ======================================================
   7️⃣ INVOICE
   ====================================================== */
export const getInvoice = async (req, res) => {
  const { id } = req.params;

  const { data: fee } = await supabase
    .from("fees")
    .select(`
      *,
      students (
        name,
        father_name,
        class,
        section,
        roll_no
      )
    `)
    .eq("id", id)
    .single();

  const previousDue = await getPreviousDueInternal(fee.student_id);

  res.json({ ...fee, previous_due: previousDue });
};
