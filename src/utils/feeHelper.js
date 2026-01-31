import { supabase } from "../services/supabase.js";

/**
 * Calculate due amount from previous months for a student
 * @param {string} studentId - Student ID
 * @param {string} currentMonth - Current month (YYYY-MM format)
 * @returns {Promise<number>} Total due amount from previous months
 */
export const calculatePreviousDue = async (studentId, currentMonth) => {
  // Get all unpaid fees before current month
  const { data: previousFees, error } = await supabase
    .from("fees")
    .select("total_fee, paid_amount")
    .eq("student_id", studentId)
    .lt("month", currentMonth)
    .in("status", ["DUE", "PARTIAL"]);

  if (error) {
    console.error("Error fetching previous dues:", error);
    return 0;
  }

  if (!previousFees || previousFees.length === 0) {
    return 0;
  }

  // Calculate total due amount
  const totalDue = previousFees.reduce((sum, fee) => {
    const due = fee.total_fee - (fee.paid_amount || 0);
    return sum + Math.max(0, due);
  }, 0);

  return totalDue;
};

/**
 * Get the previous month in YYYY-MM format
 * @param {string} currentMonth - Current month (YYYY-MM format)
 * @returns {string} Previous month in YYYY-MM format
 */
export const getPreviousMonth = (currentMonth) => {
  const [year, month] = currentMonth.split("-").map(Number);
  let prevYear = year;
  let prevMonth = month - 1;

  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
};

/**
 * Get the next month in YYYY-MM format
 * @param {string} currentMonth - Current month (YYYY-MM format)
 * @returns {string} Next month in YYYY-MM format
 */
export const getNextMonth = (currentMonth) => {
  const [year, month] = currentMonth.split("-").map(Number);
  let nextYear = year;
  let nextMonth = month + 1;

  if (nextMonth === 13) {
    nextMonth = 1;
    nextYear = year + 1;
  }

  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
};

