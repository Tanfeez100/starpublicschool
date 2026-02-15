import { supabase } from "../services/supabase.js";

/**
 * Calculate previous due amount for a student up to (but not including) a given month
 * Prefer `previous_dues` table; fallback to summing outstanding from `fee_bills`.
 */
export const calculatePreviousDue = async (studentId, month) => {
  try {
    const { data: duesRows, error } = await supabase
      .from('previous_dues')
      .select('remaining_due')
      .eq('student_id', studentId)
      .eq('status', 'pending')
      .eq('cleared', false)
      .lt('month', month);

    if (error || !duesRows || duesRows.length === 0) return 0;

    return duesRows.reduce(
      (sum, row) => sum + parseFloat(row.remaining_due || 0),
      0
    );
  } catch (err) {
    console.error('calculatePreviousDue error:', err);
    return 0;
  }
};


/**
 * Calculate advance amount for a student from advance_ledger
 * Only include active advances (status = 'active').
 */
export const calculateAdvance = async (studentId) => {
  try {
    const { data: advances, error } = await supabase
      .from('advance_ledger')
      .select('amount')
      .eq('student_id', studentId)
      .eq('status', 'active');

    if (error || !advances || advances.length === 0) return 0;
    return advances.reduce((s, a) => s + (parseFloat(a.amount || 0)), 0);
  } catch (err) {
    console.error('calculateAdvance error:', err);
    return 0;
  }
};

/**
 * Get total paid amount for a student (optionally for a month)
 * Uses `fee_payments` as source of truth.
 */
export const getTotalPaid = async (studentId, month = null) => {
  try {
    let q = supabase.from('fee_payments').select('amount_paid');
    q = q.eq('student_id', studentId);
    if (month) q = q.eq('month', month);
    const { data, error } = await q;
    if (error || !data || data.length === 0) return 0;
    return data.reduce((s, r) => s + (parseFloat(r.amount_paid || 0)), 0);
  } catch (err) {
    console.error('getTotalPaid error:', err);
    return 0;
  }
};

/**
 * Get total fee for a student in a given month from `fee_bills` (normalized)
 */
export const getTotalFee = async (studentId, month) => {
  try {
    const { data, error } = await supabase
      .from('fee_bills')
      .select('total_amount')
      .eq('student_id', studentId)
      .eq('month', month)
      .maybeSingle();

    if (error || !data) return 0;
    return parseFloat(data.total_amount || 0);
  } catch (err) {
    console.error('getTotalFee error:', err);
    return 0;
  }
};

/**
 * Get dues for a student from previous_dues table (preferred). Falls back to fee_bills outstanding.
 */
export const getDues = async (studentId) => {
  try {
    const { data: dues, error } = await supabase
      .from('previous_dues')
      .select('remaining_due')
      .eq('student_id', studentId)
      .eq('status', 'pending')
      .eq('cleared', false);

    if (!error && dues && dues.length > 0) return dues.reduce((s, r) => s + (parseFloat(r.remaining_due || 0)), 0);

    // Fallback to summing outstanding from fee_bills
    const { data: bills, error: billsErr } = await supabase
      .from('fee_bills')
      .select('id, total_amount')
      .eq('student_id', studentId);

    if (billsErr || !bills || bills.length === 0) return 0;

    const billIds = bills.map(b => b.id);
    const { data: payments, error: payErr } = await supabase
      .from('fee_payments')
      .select('bill_id, amount_paid')
      .in('bill_id', billIds || []);

    const paidMap = {};
    if (!payErr && payments) payments.forEach(p => { paidMap[p.bill_id] = (paidMap[p.bill_id] || 0) + (parseFloat(p.amount_paid || 0)); });

    let totalDues = 0;
    bills.forEach(b => {
      const paid = paidMap[b.id] || 0;
      const remaining = Math.max(0, parseFloat(b.total_amount || 0) - paid);
      if (remaining > 0) totalDues += remaining;
    });

    return totalDues;
  } catch (err) {
    console.error('getDues error:', err);
    return 0;
  }
};

