import { supabase } from "../services/supabase.js";
import { generateInvoiceNumber } from "../utils/invoiceNumber.js";




/* ======================================================
   🔧 TEST DATABASE CONNECTION
====================================================== */
export const testConnection = async (req, res) => {
  try {
    console.log("🔍 Testing database connection...");
    
    // Test 1: Simple query without join
    const { data: feesData, error: feesError } = await supabase
      .from("fees")
      .select("id, student_id, month, total_fee, status")
      .limit(5);
    
    console.log("Fees query result:", { 
      count: feesData?.length || 0, 
      error: feesError,
      sample: feesData?.[0] 
    });

    // Test 2: Check students table
    const { data: studentsData, error: studentsError } = await supabase
      .from("students")
      .select("id, name, class")
      .limit(5);
    
    console.log("Students query result:", { 
      count: studentsData?.length || 0, 
      error: studentsError,
      sample: studentsData?.[0] 
    });

    // Test 3: Try the join query
    const { data: joinData, error: joinError } = await supabase
      .from("fees")
      .select(`
        id,
        month,
        total_fee,
        students (
          id,
          name,
          class
        )
      `)
      .limit(5);
    
    console.log("Join query result:", { 
      count: joinData?.length || 0, 
      error: joinError,
      sample: joinData?.[0] 
    });

    res.json({
      success: true,
      tests: {
        fees: {
          count: feesData?.length || 0,
          error: feesError?.message || null,
          hasData: (feesData?.length || 0) > 0
        },
        students: {
          count: studentsData?.length || 0,
          error: studentsError?.message || null,
          hasData: (studentsData?.length || 0) > 0
        },
        join: {
          count: joinData?.length || 0,
          error: joinError?.message || null,
          hasData: (joinData?.length || 0) > 0
        }
      },
      message: "Database connection test completed. Check the tests object for details."
    });
  } catch (err) {
    console.error("❌ TEST CONNECTION ERROR:", err);
    res.status(500).json({ 
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

/* ======================================================
   0️⃣ CLOSE MONTH DUES
====================================================== */
export const closeMonth = async (req, res) => {
  const { fromMonth, toMonth } = req.body;

  if (!fromMonth || !toMonth) {
    return res.status(400).json({
      message: "fromMonth and toMonth are required",
    });
  }

  const { error } = await supabase.rpc("close_month_dues", {
    from_month: fromMonth,
    to_month: toMonth,
  });

  if (error) {
    console.error("CLOSE MONTH ERROR:", error);
    return res.status(500).json({ message: error.message });
  }

  res.json({ success: true });
};

/* ======================================================
   1️⃣ GET FEES LIST
====================================================== */
export const getFees = async (req, res) => {
  try {
    const { month, status } = req.query;

    console.log("🔍 GET FEES - Query params:", { month, status });

    // First, try with join to get student details
    let query = supabase
      .from("fees")
      .select(`
        *,
        students (
          name,
          father_name,
          class,
          section,
          roll_no,
          mobile,
          address
        )
      `)
      .order("created_at", { ascending: false });

    if (month) query = query.eq("month", month);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    
    if (error) {
      console.error("❌ GET FEES ERROR (with join):", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      
      // Fallback: Try without join if join fails
      console.log("🔄 Trying fallback query without join...");
      let fallbackQuery = supabase
        .from("fees")
        .select("*")
        .order("created_at", { ascending: false });

      if (month) fallbackQuery = fallbackQuery.eq("month", month);
      if (status) fallbackQuery = fallbackQuery.eq("status", status);

      const { data: fallbackData, error: fallbackError } = await fallbackQuery;
      
      if (fallbackError) {
        console.error("❌ GET FEES ERROR (fallback):", fallbackError);
        return res.status(500).json({ 
          message: "Failed to load fees",
          error: fallbackError.message,
          details: fallbackError
        });
      }

      console.log(`✅ GET FEES (fallback) - Found ${fallbackData?.length || 0} records`);
      return res.json(fallbackData || []);
    }

    console.log(`✅ GET FEES - Found ${data?.length || 0} records`);
    
    // If data is empty, it might just mean no records exist
    if (!data || data.length === 0) {
      console.log("⚠️ No fees found in database. This might be normal if no fees have been generated yet.");
    }
    
    res.json(data || []);
  } catch (err) {
    console.error("❌ GET FEES EXCEPTION:", err);
    console.error("Exception stack:", err.stack);
    res.status(500).json({ 
      message: "Failed to load fees",
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

/* ======================================================
   2️⃣ HELPER: PREVIOUS DUE
====================================================== */
const getPreviousDue = async (studentId) => {
  const { data } = await supabase
    .from("previous_dues")
    .select("remaining_due, type")
    .eq("student_id", studentId)
    .eq("cleared", false);

  let due = 0;
  let fine = 0;

  (data || []).forEach((d) => {
    if (d.type === "FINE") fine += Number(d.remaining_due);
    else due += Number(d.remaining_due);
  });

  return { due, fine };
};

/* ======================================================
   3️⃣ SAVE / UPDATE FEE STRUCTURE
====================================================== */
export const saveFeeStructure = async (req, res) => {
  const {
    className,
    tuition_fee = 0,
    annual_fee = 0,
    computer_fee = 0,
    exam_fee = 0,
  } = req.body;

  if (!className)
    return res.status(400).json({ message: "className is required" });

  const { error } = await supabase.from("fee_structure").upsert({
    class: className,
    tuition_fee: Number(tuition_fee),
    annual_fee: Number(annual_fee),
    computer_fee: Number(computer_fee),
    exam_fee: Number(exam_fee),
    updated_at: new Date().toISOString(),
  });

  if (error)
    return res.status(500).json({ message: error.message });

  res.json({ success: true });
};

/* ======================================================
   4️⃣ GET FEE STRUCTURE BY CLASS
====================================================== */
export const getFeeStructureByClass = async (req, res) => {
  const { className } = req.params;

  const { data, error } = await supabase
    .from("fee_structure")
    .select("*")
    .eq("class", className)
    .maybeSingle();

  if (error) return res.status(500).json({ message: error.message });
  res.json(data || {});
};

/* ======================================================
   5️⃣ HELPER: BUILD BREAKDOWN (ALWAYS FULL)
====================================================== */
const buildBreakdown = ({
  tuition,
  exam,
  annual,
  computer,
  transport,
  due,
  fine,
  advanceAdjustment,
}) => {
  const breakdown = {
    "Tuition Fee": tuition || "",
    "Exam Fee": exam || "",
    "Annual Fee": annual || "",
    "Computer Fee": computer || "",
    "Transport Fee": transport || "",
    "Previous Due": due || "",
    "Fine": fine || "",
  };
  
  // Add advance adjustment if it exists
  if (advanceAdjustment && advanceAdjustment > 0) {
    breakdown["Advance Adjustment"] = `-${advanceAdjustment}`;
  }
  
  return breakdown;
};

/* ======================================================
   6️⃣ GENERATE SINGLE FEE
====================================================== */
export const generateFee = async (req, res) => {
  try {
    const { student_id, month } = req.body;

    const { data: exists } = await supabase
      .from("fees")
      .select("id")
      .eq("student_id", student_id)
      .eq("month", month)
      .maybeSingle();

    if (exists) {
      return res.status(400).json({ message: "Fee already generated" });
    }

    const { data: student } = await supabase
      .from("students")
      .select("id, class, uses_transport, transport_charge")
      .eq("id", student_id)
      .single();

    const { data: fs } = await supabase
      .from("fee_structure")
      .select("*")
      .eq("class", student.class)
      .single();

    const { due, fine, advance: prevAdvance } =
      await getNetCarryForward(student_id);

    const tuition = Number(fs.tuition_fee || 0);
    const exam = Number(fs.exam_fee || 0);
    const annual = Number(fs.annual_fee || 0);
    const computer = Number(fs.computer_fee || 0);
    const transport = student.uses_transport
      ? Number(student.transport_charge || 0)
      : 0;

    const baseFee =
      tuition + exam + annual + computer + transport + due + fine;

    const advanceUsed = Math.min(prevAdvance, baseFee);
    const payable = baseFee - advanceUsed;
    const remainingAdvance = prevAdvance - advanceUsed;

    const invoice_no = await generateInvoiceNumber();

    const breakdown = buildBreakdown({
      tuition,
      exam,
      annual,
      computer,
      transport,
      due,
      fine,
      advanceAdjustment: advanceUsed,
    });

    await supabase.from("fees").insert({
      student_id,
      month,
      invoice_no,

      tuition_fee: tuition,
      exam_fee: exam,
      annual_fee: annual,
      computer_fee: computer,
      transport_fee: transport,

      previous_due: due,
      fine_amount: fine,

      total_fee: baseFee,
      paid_amount: 0,
      due_amount: payable,
      advance: remainingAdvance,
      status: payable === 0 ? "PAID" : "DUE",
      breakdown,
    });

    res.json({ success: true, invoice_no });
  } catch (err) {
    console.error("GENERATE FEE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};


/* ======================================================
   7️⃣ BULK GENERATE FEES
====================================================== */
export const generateBulkFees = async (req, res) => {
  try {
    const {
      className,
      month,
      addExam = false,
      addAnnual = false,
      addComputer = false,
      preview = true,
    } = req.body;

    if (!className || !month)
      return res
        .status(400)
        .json({ message: "className and month are required" });

    const { data: students } = await supabase
      .from("students")
      .select(
        "id, name, class, section, roll_no, uses_transport, transport_charge"
      )
      .eq("class", className)
      .order("roll_no");

    if (!students?.length)
      return res
        .status(400)
        .json({ message: `No students found for class ${className}` });

    const { data: fs } = await supabase
      .from("fee_structure")
      .select("*")
      .eq("class", className)
      .single();

    if (!fs)
      return res
        .status(400)
        .json({ message: `Fee structure not found for class ${className}` });

    const invoices = [];

    for (const student of students) {
      const { due, fine, advance: prevAdvance } =
        await getNetCarryForward(student.id);

      const tuition = Number(fs.tuition_fee || 0);
      const exam = addExam ? Number(fs.exam_fee || 0) : 0;
      const annual = addAnnual ? Number(fs.annual_fee || 0) : 0;
      const computer = addComputer ? Number(fs.computer_fee || 0) : 0;
      const transport = student.uses_transport
        ? Number(student.transport_charge || 0)
        : 0;

      // Calculate base total fee (before advance adjustment)
      const baseTotalFee =
        tuition + exam + annual + computer + transport + due + fine;

      // Calculate advance adjustment
      const advanceAdjustment = Math.min(prevAdvance, baseTotalFee);
      const payableAmount = baseTotalFee - advanceAdjustment;
      const remainingAdvance = prevAdvance - advanceAdjustment;

      // Determine status based on payable amount
      const status = payableAmount === 0 ? "PAID" : "DUE";

      // Build breakdown with advance adjustment
      const breakdown = buildBreakdown({
        tuition,
        exam,
        annual,
        computer,
        transport,
        due,
        fine,
        advanceAdjustment,
      });

      const invoice = {
        student,
        month,
        total_fee: baseTotalFee,
        advance_adjustment: advanceAdjustment,
        payable_amount: payableAmount,
        remaining_advance: remainingAdvance,
        breakdown,
        status,
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
            computer_fee: computer,
            transport_fee: transport,
            previous_due: due,
            fine_amount: fine,
            total_fee: baseTotalFee,
            paid_amount: 0,
            due_amount: payableAmount,
            advance: remainingAdvance,
            status: status,
            breakdown,
          },
          { onConflict: "student_id,month" }
        );
      }

      invoices.push(invoice);
    }

    res.json(invoices);
  } catch (err) {
    console.error("🔥 BULK GENERATE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* ======================================================
   8️⃣ PAY FEE
====================================================== */
export const payFee = async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;

  try {
    const pay = Number(amount || 0);
    if (pay <= 0) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    const { data: fee, error } = await supabase
      .from("fees")
      .select("total_fee, paid_amount")
      .eq("id", id)
      .single();

    if (error || !fee) {
      return res.status(404).json({ message: "Fee not found" });
    }

    const totalFee = Number(fee.total_fee || 0);
    const paidTillNow = Number(fee.paid_amount || 0) + pay;

    let due_amount = 0;
    let advance = 0;
    let status = "PAID";

    if (paidTillNow < totalFee) {
      due_amount = totalFee - paidTillNow;
      advance = 0;
      status = paidTillNow > 0 ? "PARTIAL" : "DUE";
    } else if (paidTillNow > totalFee) {
      due_amount = 0;
      advance = paidTillNow - totalFee;
      status = "ADVANCE";
    } else {
      due_amount = 0;
      advance = 0;
      status = "PAID";
    }

    await supabase
      .from("fees")
      .update({
        paid_amount: paidTillNow,
        due_amount,
        advance,
        status,
      })
      .eq("id", id);

    res.json({
      success: true,
      paid_amount: paidTillNow,
      due_amount,
      advance,
      status,
    });
  } catch (err) {
    console.error("PAY FEE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};



/* ======================================================
   9️⃣ INVOICE
====================================================== */
export const getInvoice = async (req, res) => {
  try {
    const { id } = req.params;

   const { data: fee, error } = await supabase
  .from("fees")
  .select(`
    id,
    invoice_no,
    month,
    breakdown,
    total_fee,
    paid_amount,
    due_amount,
    advance,
    status,
    created_at,
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

    if (error || !fee) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const totalFee = Number(fee.total_fee || 0);
const paidAmount = Number(fee.paid_amount || 0);
const balance = Number(fee.due_amount || 0);
const advance = Number(fee.advance || 0);

res.json({
  id: fee.id,
  invoiceNo: fee.invoice_no,
  month: fee.month,
  student: fee.students,
  breakdown: fee.breakdown || {},

  totalFee,
  paidAmount,
  balance,   // 👈 fees.due_amount
  advance,   // 👈 fees.advance

  status: fee.status,
  createdAt: fee.created_at,
});

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getNetCarryForward = async (studentId) => {
  // 1️⃣ previous dues
  const { data: dues } = await supabase
    .from("previous_dues")
    .select("remaining_due, type")
    .eq("student_id", studentId)
    .eq("cleared", false);

  let due = 0;
  let fine = 0;

  (dues || []).forEach((d) => {
    if (d.type === "FINE") fine += Number(d.remaining_due || 0);
    else due += Number(d.remaining_due || 0);
  });

  // 2️⃣ previous advance
  const { data: lastFee } = await supabase
    .from("fees")
    .select("advance")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const prevAdvance = Number(lastFee?.advance || 0);

  // ✅ ONLY carry forward
  return {
    due,
    fine,
    advance: prevAdvance, // ❗ DO NOT ADJUST HERE
  };
};

