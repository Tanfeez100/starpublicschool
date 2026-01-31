import { supabase } from "../services/supabase.js";

/* ================= SINGLE STUDENT INVOICE ================= */

export const generateInvoiceData = async ({
  student,
  month,
  try {
    // Fetch all DUE/PARTIAL records for the student
    const { data, error } = await supabase
      .from("fees")
      .select("month, due_amount")
      .eq("student_id", studentId)
      .in("status", ["DUE", "PARTIAL"]);

    if (error || !data) return 0;

    // Helper to compare months (supports both 'YYYY-MM' and academic month names)
    function isBefore(a, b) {
      // If both are YYYY-MM
      if (/^\d{4}-\d{2}$/.test(a) && /^\d{4}-\d{2}$/.test(b)) {
        return a < b;
      }
      // If both are month names (April, May, ... March)
      const months = [
        "April", "May", "June", "July", "August", "September",
        "October", "November", "December", "January", "February", "March"
      ];
      const idxA = months.indexOf(a);
      const idxB = months.indexOf(b);
      if (idxA !== -1 && idxB !== -1) {
        return idxA < idxB;
      }
      return a < b;
    }

    let totalDue = 0;
    for (const fee of data) {
      if (fee.month && currentMonth && isBefore(fee.month, currentMonth)) {
        totalDue += Number(fee.due_amount || 0);
      }
    }
    return Math.max(0, totalDue);
  } catch (err) {
    console.error("calculatePreviousDue error:", err);
    return 0;
  }
};
  };
};

/* ================= BULK INVOICE GENERATION ================= */

export const generateBulkInvoices = async ({
  className,
  month,
  baseFee,
  finePerMonth = 50,
  examFee = 0,
  annualFee = 0,
}) => {
  if (!className || !month || !baseFee) {
    throw new Error("Missing required parameters");
  }

  const { data: students, error } = await supabase
    .from("students")
    .select("id, name, class, section, roll_no")
    .eq("class", className)
    .order("roll_no");

  if (error || !students?.length) {
    throw new Error("No students found");
  }

  const invoices = [];

  for (const student of students) {
    const previousDue = await calculatePreviousDue(student.id, month);

    const invoice = await generateInvoiceData({
      student: { ...student, previous_due: previousDue },
      month,
      currentMonthFee: baseFee,
      finePerMonth,
      examFee,
      annualFee,
    });

    invoices.push(invoice);
  }

  return invoices;
};

/* ================= PREVIOUS DUE CALCULATION ================= */

/**
 * Calculate unpaid amount from ONLY previous months
 */
/**
 * Calculate due amount from previous months for a student
 */
export const calculatePreviousDue = async (studentId) => {
  try {
    const { data, error } = await supabase
      .from("fees")
      .select("total_fee, paid_amount")
      .eq("student_id", studentId)
      .in("status", ["DUE", "PARTIAL"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
  try {
    // Fetch all DUE/PARTIAL records for the student
    const { data, error } = await supabase
      .from("fees")
      .select("month, total_fee, paid_amount")
      .eq("student_id", studentId)
      .in("status", ["DUE", "PARTIAL"]);

    if (error || !data) return 0;

    // Helper to compare months (supports both 'YYYY-MM' and academic month names)
    function isBefore(a, b) {
      // If both are YYYY-MM
      if (/^\d{4}-\d{2}$/.test(a) && /^\d{4}-\d{2}$/.test(b)) {
        return a < b;
      }
      // If both are month names (April, May, ... March)
      const months = [
        "April", "May", "June", "July", "August", "September",
        "October", "November", "December", "January", "February", "March"
      ];
      const idxA = months.indexOf(a);
      const idxB = months.indexOf(b);
      if (idxA !== -1 && idxB !== -1) {
        // Academic year: April (0) to March (11)
        // If b is before a in the academic year, treat as before
        return idxA < idxB;
      }
      // Fallback: string compare
      return a < b;
    }

    // Accept currentMonth as second argument
    const currentMonth = arguments[1];

    // Sum all dues for months strictly before the current month
    let totalDue = 0;
    for (const fee of data) {
      if (fee.month && currentMonth && isBefore(fee.month, currentMonth)) {
        totalDue += Number(fee.total_fee || 0) - Number(fee.paid_amount || 0);
      }
    }
    return Math.max(0, totalDue);
  } catch (err) {
    console.error("calculatePreviousDue error:", err);
    return 0;
  }
};
  currentFee: invoice.currentFee,
  previousDue: invoice.previousDue,
  fine: invoice.fine,
  examFee: invoice.examFee,
  annualFee: invoice.annualFee,
  advance: invoice.advance,
  totalFee: invoice.totalFee,
  breakdown: invoice.breakdown,
  status: invoice.status,
});
