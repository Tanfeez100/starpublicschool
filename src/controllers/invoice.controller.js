import { supabase } from "../services/supabase.js";

/**
 * Fetch invoice by fee id (CLEAN + COMPLETE)
 */
export const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: fee, error } = await supabase
      .from("fees")
      .select(`
        id,
        month,
        tuition_fee,
        previous_due,
        fine,
        exam_fee,
        annual_fee,
        advance,
        total_fee,
        paid_amount,
        status,
        breakdown,
        created_at,
        students (
          id,
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

    res.json({
      id: fee.id,
      month: fee.month,
      student: fee.students,
      breakdown: fee.breakdown || {
        "Current Month Fee": Number(fee.tuition_fee || 0),
        "Previous Due": Number(fee.previous_due || 0),
        "Fine": Number(fee.fine || 0),
        "Exam Fee": Number(fee.exam_fee || 0),
        "Annual Fee": Number(fee.annual_fee || 0),
      },
      totalFee,
      paidAmount,
      balance: Math.max(0, totalFee - paidAmount),
      advance: Number(fee.advance || 0),
      status: fee.status,
      createdAt: fee.created_at,
    });
  } catch (err) {
    console.error("❌ INVOICE FETCH ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Raw SQL version (optional, consistent response)
 */
export const getInvoiceByIdSQL = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase.rpc("exec_sql", {
      sql: `
        SELECT 
          f.*,
          s.name,
          s.father_name,
          s.class,
          s.section,
          s.roll_no
        FROM fees f
        JOIN students s ON f.student_id = s.id
        WHERE f.id = $1
      `,
      params: [id],
    });

    if (error || !data?.length) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const fee = data[0];

    res.json({
      id: fee.id,
      month: fee.month,
      student: {
        name: fee.name,
        father_name: fee.father_name,
        class: fee.class,
        section: fee.section,
        roll_no: fee.roll_no,
      },
      breakdown: fee.breakdown || {},
      totalFee: Number(fee.total_fee || 0),
      paidAmount: Number(fee.paid_amount || 0),
      balance: Math.max(0, Number(fee.total_fee || 0) - Number(fee.paid_amount || 0)),
      advance: Number(fee.advance || 0),
      status: fee.status,
    });
  } catch (err) {
    console.error("❌ SQL INVOICE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};
