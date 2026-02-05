import { supabase } from "../services/supabase.js";

/**
 * Calculate previous due amount for a student up to a given month
 * @param {string} studentId - Student UUID
 * @param {string} month - Month in YYYY-MM format
 * @returns {Promise<number>} Previous due amount
 */
export const calculatePreviousDue = async (studentId, month) => {
  try {
    // Get all unpaid/partial fees before the given month
    const [year, monthNum] = month.split("-").map(Number);
    
    // Get all fees before the given month
    const { data: previousFees, error } = await supabase
      .from("fees")
      .select("total_fee, paid_amount")
      .eq("student_id", studentId)
      .lt("month", month)
      .order("month", { ascending: false });

    if (error) {
      console.error("Error calculating previous due:", error);
      return 0;
    }

    if (!previousFees || previousFees.length === 0) {
      return 0;
    }

    // Calculate total due from previous months
    let totalDue = 0;
    for (const fee of previousFees) {
      const remaining = (fee.total_fee || 0) - (fee.paid_amount || 0);
      if (remaining > 0) {
        totalDue += remaining;
      }
    }

    return totalDue;
  } catch (error) {
    console.error("Error in calculatePreviousDue:", error);
    return 0;
  }
};

/**
 * Calculate advance amount for a student
 * @param {string} studentId - Student UUID
 * @returns {Promise<number>} Advance amount
 */
export const calculateAdvance = async (studentId) => {
  try {
    // Get all fees with advance amounts
    const { data: fees, error } = await supabase
      .from("fees")
      .select("advance")
      .eq("student_id", studentId);

    if (error) {
      console.error("Error calculating advance:", error);
      return 0;
    }

    if (!fees || fees.length === 0) {
      return 0;
    }

    // Sum all advance amounts
    const totalAdvance = fees.reduce((sum, fee) => {
      return sum + (fee.advance || 0);
    }, 0);

    return totalAdvance;
  } catch (error) {
    console.error("Error in calculateAdvance:", error);
    return 0;
  }
};

/**
 * Get total paid amount for a student
 * @param {string} studentId - Student UUID
 * @param {string} month - Optional month filter (YYYY-MM)
 * @returns {Promise<number>} Total paid amount
 */
export const getTotalPaid = async (studentId, month = null) => {
  try {
    let query = supabase
      .from("fees")
      .select("paid_amount")
      .eq("student_id", studentId);

    if (month) {
      query = query.eq("month", month);
    }

    const { data: fees, error } = await query;

    if (error) {
      console.error("Error getting total paid:", error);
      return 0;
    }

    if (!fees || fees.length === 0) {
      return 0;
    }

    const totalPaid = fees.reduce((sum, fee) => {
      return sum + (fee.paid_amount || 0);
    }, 0);

    return totalPaid;
  } catch (error) {
    console.error("Error in getTotalPaid:", error);
    return 0;
  }
};

/**
 * Calculate total fee for a student in a given month
 * @param {string} studentId - Student UUID
 * @param {string} month - Month in YYYY-MM format
 * @returns {Promise<number>} Total fee amount
 */
export const getTotalFee = async (studentId, month) => {
  try {
    const { data: fee, error } = await supabase
      .from("fees")
      .select("total_fee")
      .eq("student_id", studentId)
      .eq("month", month)
      .single();

    if (error || !fee) {
      return 0;
    }

    return fee.total_fee || 0;
  } catch (error) {
    console.error("Error in getTotalFee:", error);
    return 0;
  }
};

/**
 * Get dues for a student
 * @param {string} studentId - Student UUID
 * @returns {Promise<number>} Total dues amount
 */
export const getDues = async (studentId) => {
  try {
    const { data: fees, error } = await supabase
      .from("fees")
      .select("total_fee, paid_amount")
      .eq("student_id", studentId);

    if (error) {
      console.error("Error getting dues:", error);
      return 0;
    }

    if (!fees || fees.length === 0) {
      return 0;
    }

    let totalDues = 0;
    for (const fee of fees) {
      const remaining = (fee.total_fee || 0) - (fee.paid_amount || 0);
      if (remaining > 0) {
        totalDues += remaining;
      }
    }

    return totalDues;
  } catch (error) {
    console.error("Error in getDues:", error);
    return 0;
  }
};

