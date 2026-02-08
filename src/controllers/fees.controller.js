import { supabase } from "../services/supabase.js";
import { getDues, getTotalPaid, getTotalFee, calculateAdvance } from "../utils/feeHelper.js";

/**
 * Close a month - handle dues for unpaid fees
 * POST /api/fees/close-month
 * Body: { month: "YYYY-MM" }
 */
export const closeMonth = async (req, res) => {
  try {
    const { month } = req.body;

    if (!month) {
      return res.status(400).json({
        message: "month is required",
      });
    }

    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM (e.g., 2024-01)",
      });
    }

    const [year, monthNum] = month.split("-").map(Number);

    // Check if month is already closed
    const { data: existingClosure, error: closureError } = await supabase
      .from("month_closures")
      .select("id, month")
      .eq("month", month)
      .single();

    if (existingClosure) {
      return res.status(400).json({
        message: `Month ${month} has already been closed`,
        closed_at: existingClosure.closed_at,
      });
    }

    // Get all unpaid/partial bills for the month
    const { data: bills, error: billsError } = await supabase
      .from("fee_bills")
      .select("id, student_id, total_amount, bill_status")
      .eq("month", month)
      .in("bill_status", ["unpaid", "partial"]);

    if (billsError) {
      return res.status(500).json({
        message: "Failed to fetch bills",
        error: billsError.message,
      });
    }

    if (!bills || bills.length === 0) {
      // No unpaid bills, just mark month as closed
      const { data: closure, error: closeError } = await supabase
        .from("month_closures")
        .insert([
          {
            month,
            year,
            closed_by: req.user?.id || null,
          },
        ])
        .select()
        .single();

      if (closeError) {
        return res.status(500).json({
          message: "Failed to close month",
          error: closeError.message,
        });
      }

      return res.json({
        message: `Month ${month} closed successfully. No unpaid bills found.`,
        closure,
        dues_created: 0,
      });
    }

    // Get payments for all bills
    const billIds = bills.map((b) => b.id);
    const { data: payments, error: paymentsError } = await supabase
      .from("fee_payments")
      .select("bill_id, amount_paid")
      .in("bill_id", billIds);

    if (paymentsError) {
      return res.status(500).json({
        message: "Failed to fetch payments",
        error: paymentsError.message,
      });
    }

    // Calculate total paid per bill
    const paymentsByBill = {};
    if (payments) {
      payments.forEach((p) => {
        if (!paymentsByBill[p.bill_id]) {
          paymentsByBill[p.bill_id] = 0;
        }
        paymentsByBill[p.bill_id] += p.amount_paid || 0;
      });
    }

    // Create previous_dues entries for unpaid amounts
    const duesToCreate = [];
    let totalDuesAmount = 0;

    for (const bill of bills) {
      const totalPaid = paymentsByBill[bill.id] || 0;
      const remaining = bill.total_amount - totalPaid;

      if (remaining > 0) {
        // Check if due already exists for this student and month
        const { data: existingDue } = await supabase
          .from("previous_dues")
          .select("id")
          .eq("student_id", bill.student_id)
          .eq("month", month)
          .single();

        if (!existingDue) {
          duesToCreate.push({
            student_id: bill.student_id,
            amount: remaining,
            month,
            year,
            status: "pending",
          });
          totalDuesAmount += remaining;
        }
      }
    }

    // Insert dues if any
    if (duesToCreate.length > 0) {
      const { error: duesError } = await supabase
        .from("previous_dues")
        .insert(duesToCreate);

      if (duesError) {
        return res.status(500).json({
          message: "Failed to create previous dues",
          error: duesError.message,
        });
      }
    }

    // Mark month as closed
    const { data: closure, error: closeError } = await supabase
      .from("month_closures")
      .insert([
        {
          month,
          year,
          closed_by: req.user?.id || null,
        },
      ])
      .select()
      .single();

    if (closeError) {
      return res.status(500).json({
        message: "Failed to close month",
        error: closeError.message,
      });
    }

    res.json({
      message: `Month ${month} closed successfully`,
      closure,
      dues_created: duesToCreate.length,
      total_dues_amount: totalDuesAmount,
      unpaid_bills: bills.length,
    });
  } catch (error) {
    console.error("Error closing month:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Get dues for a student
 * GET /api/fees/dues/:student_id
 */
export const getStudentDues = async (req, res) => {
  try {
    const { student_id } = req.params;

    if (!student_id) {
      return res.status(400).json({
        message: "student_id is required",
      });
    }

    // Get all pending dues for the student
    const { data: dues, error } = await supabase
      .from("previous_dues")
      .select("*")
      .eq("student_id", student_id)
      .eq("status", "pending")
      .order("month", { ascending: false });

    if (error) {
      return res.status(500).json({
        message: "Failed to fetch dues",
        error: error.message,
      });
    }

    const totalDues = dues?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0;

    res.json({
      message: "Dues fetched successfully",
      student_id,
      total_dues: totalDues,
      dues: dues || [],
      count: dues?.length || 0,
    });
  } catch (error) {
    console.error("Error getting dues:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Get fee list for dashboard
 * GET /api/fees/list?class=&section=&month=
 */
export const getFeeList = async (req, res) => {
  try {
    const { class: className, section, month } = req.query;

    // Build student query
    let studentQuery = supabase
      .from("students")
      .select("id, name, father_name, roll_no, class, section");

    if (className) {
      studentQuery = studentQuery.eq("class", className);
    }

    if (section) {
      studentQuery = studentQuery.eq("section", section);
    }

    const { data: students, error: studentsError } = await studentQuery;

    if (studentsError) {
      return res.status(500).json({
        message: "Failed to fetch students",
        error: studentsError.message,
      });
    }

    if (!students || students.length === 0) {
      return res.json({
        message: "No students found",
        data: [],
        count: 0,
      });
    }

    // Get fee data for each student
    const feeListPromises = students.map(async (student) => {
      let totalFee = 0;
      let totalPaid = 0;
      let dues = 0;
      let advance = 0;

      if (month) {
        // Get fee for specific month
        totalFee = await getTotalFee(student.id, month);
        totalPaid = await getTotalPaid(student.id, month);
      } else {
        // Get all-time totals
        const { data: bills } = await supabase
          .from("fee_bills")
          .select("total_amount")
          .eq("student_id", student.id);

        totalFee = bills?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;

        const { data: payments } = await supabase
          .from("fee_payments")
          .select("amount_paid")
          .eq("student_id", student.id);

        totalPaid = payments?.reduce((sum, p) => sum + (p.amount_paid || 0), 0) || 0;
      }

      dues = await getDues(student.id);
      advance = await calculateAdvance(student.id);

      return {
        student_id: student.id,
        student_name: student.name,
        father_name: student.father_name,
        roll_no: student.roll_no,
        class: student.class,
        section: student.section,
        total_fee: totalFee,
        total_paid: totalPaid,
        dues: dues,
        advance: advance,
      };
    });

    const feeList = await Promise.all(feeListPromises);

    res.json({
      message: "Fee list fetched successfully",
      data: feeList,
      count: feeList.length,
    });
  } catch (error) {
    console.error("Error getting fee list:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Record fee payment
 * POST /api/fees/pay
 * Body: {
 *   class, section, roll_number, amount_paid, payment_mode, payment_date?, month?
 * }
 */
export const payFee = async (req, res) => {
  try {
    const { class: className, section, roll_number, amount_paid, payment_mode, payment_date, month } = req.body;

    // Validation
    if (!className || !section || !roll_number || !amount_paid || !payment_mode) {
      return res.status(400).json({
        message: "class, section, roll_number, amount_paid, and payment_mode are required",
      });
    }

    if (typeof amount_paid !== "number" || amount_paid <= 0) {
      return res.status(400).json({
        message: "amount_paid must be a positive number",
      });
    }

    const validPaymentModes = ["cash", "cheque", "online", "bank_transfer"];
    if (!validPaymentModes.includes(payment_mode.toLowerCase())) {
      return res.status(400).json({
        message: `payment_mode must be one of: ${validPaymentModes.join(", ")}`,
      });
    }

    // Find student by class, section, and roll_number
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("*")
      .eq("class", className)
      .eq("section", section)
      .eq("roll_no", roll_number)
      .single();

    if (studentError || !student) {
      return res.status(404).json({
        message: "Student not found with the provided class, section, and roll number",
      });
    }

    const student_id = student.id;

    // Determine month - use provided month or current month
    let billMonth = month;
    if (!billMonth) {
      const now = new Date();
      billMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    const [year, monthNum] = billMonth.split("-").map(Number);

    // Find fee record in fees table for this student and month
    let feeRecord;

    if (month) {
      // Get fee for specific month
      const { data: existingFee, error: feeError } = await supabase
        .from("fees")
        .select("*")
        .eq("student_id", student_id)
        .eq("month", billMonth)
        .single();

      if (feeError && feeError.code !== "PGRST116") {
        return res.status(500).json({
          message: "Failed to fetch fee record",
          error: feeError.message,
        });
      }

      feeRecord = existingFee;
    } else {
      // Get the latest fee (most recent month)
      const { data: latestFee, error: feeError } = await supabase
        .from("fees")
        .select("*")
        .eq("student_id", student_id)
        .order("month", { ascending: false })
        .limit(1)
        .single();

      if (feeError && feeError.code !== "PGRST116") {
        return res.status(500).json({
          message: "Failed to fetch fee record",
          error: feeError.message,
        });
      }

      feeRecord = latestFee;

      if (latestFee) {
        billMonth = latestFee.month;
      }
    }

    // If no fee record exists, return error (bill should be generated first)
    if (!feeRecord) {
      return res.status(404).json({
        message: `No bill found for this student. Please generate bill first for month ${billMonth}`,
        student: {
          id: student_id,
          name: student.name,
          class: student.class,
          roll_no: student.roll_no,
        },
      });
    }

    // Get current paid amount and total fee from fee record
    const currentPaidAmount = feeRecord.paid_amount || 0;
    const totalFee = feeRecord.total_fee || 0;
    const remainingAmount = totalFee - currentPaidAmount;
    
    // Calculate how much goes to fee payment and how much is advance
    // Example: Total Fee = 5000, Already Paid = 0, Payment = 8000
    // amountForFee = 5000 (fee fully paid)
    // advanceAmount = 3000 (only excess goes to advance_ledger)
    let amountForFee = 0;
    let advanceAmount = 0;
    
    if (amount_paid <= remainingAmount) {
      // Payment is within remaining fee amount - no advance
      amountForFee = amount_paid;
      advanceAmount = 0;
    } else {
      // Payment exceeds remaining fee amount - only excess goes to advance
      // Example: remainingAmount = 5000, amount_paid = 8000
      // amountForFee = 5000 (fee payment)
      // advanceAmount = 3000 (ONLY this excess goes to advance_ledger, NOT 8000)
      amountForFee = remainingAmount;
      advanceAmount = amount_paid - remainingAmount;
    }
    
    const newTotalPaid = currentPaidAmount + amountForFee;
    const newDueAmount = totalFee - newTotalPaid;

    // Determine new status
    let newStatus = "DUE";
    if (newTotalPaid >= totalFee) {
      newStatus = "PAID";
    } else if (newTotalPaid > 0) {
      newStatus = "PARTIAL";
    } else if (newTotalPaid < 0) {
      newStatus = "ADVANCE";
    }

    // Update fee record in fees table
    const updateData = {
      paid_amount: newTotalPaid,
      due_amount: newDueAmount,
      status: newStatus,
      advance: advanceAmount > 0 ? (feeRecord.advance || 0) + advanceAmount : (feeRecord.advance || 0),
      updated_at: new Date().toISOString(),
    };

    // If payment is fully paid, set paid_on date
    if (newStatus === "PAID" && !feeRecord.paid_on) {
      updateData.paid_on = payment_date || new Date().toISOString();
    }

    const { data: updatedFee, error: updateError } = await supabase
      .from("fees")
      .update(updateData)
      .eq("id", feeRecord.id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({
        message: "Failed to update fee record",
        error: updateError.message,
      });
    }

    // Save ONLY the advance amount (excess) in advance_ledger, NOT the total payment
    // Example: If payment is 8000 and fee is 5000, only 3000 goes to advance_ledger
    let advanceLedgerEntry = null;
    if (advanceAmount > 0) {
      const [yearNum, monthNum] = billMonth.split("-").map(Number);
      const { data: advanceEntry, error: advanceError } = await supabase
        .from("advance_ledger")
        .insert([
          {
            student_id,
            bill_id: null, // No bill_id since we're using fees table
            amount: parseFloat(advanceAmount), // ONLY advance amount (excess), NOT total payment
            payment_mode: payment_mode.toLowerCase(),
            payment_date: payment_date || new Date().toISOString().split("T")[0],
            month: billMonth,
            year: yearNum,
            status: "active",
          },
        ])
        .select()
        .single();

      if (advanceError) {
        console.error("Failed to save advance in ledger:", advanceError);
        // Continue even if advance ledger save fails - payment was recorded
      } else {
        advanceLedgerEntry = advanceEntry;
      }
    }

    // Get total active advance for the student from advance_ledger
    const { data: activeAdvances, error: advancesError } = await supabase
      .from("advance_ledger")
      .select("amount")
      .eq("student_id", student_id)
      .eq("status", "active");

    let totalPaidAdvance = 0;
    if (activeAdvances && !advancesError) {
      totalPaidAdvance = activeAdvances.reduce((sum, a) => sum + (a.amount || 0), 0);
    }

    // Prepare student details (excluding marks)
    const studentDetails = {
      id: student.id,
      name: student.name,
      father_name: student.father_name,
      mother_name: student.mother_name,
      roll_no: student.roll_no,
      class: student.class,
      section: student.section,
      gender: student.gender,
      mobile: student.mobile,
      address: student.address,
      uses_transport: student.uses_transport,
      transport_charge: student.transport_charge,
      created_at: student.created_at,
    };

    res.status(201).json({
      message: "Payment recorded successfully",
      fee_id: feeRecord.id,
      student: studentDetails,
      fee: {
        id: updatedFee?.id || feeRecord.id,
        month: updatedFee?.month || billMonth,
        total_fee: updatedFee?.total_fee || totalFee,
        paid_amount: updatedFee?.paid_amount || newTotalPaid,
        due_amount: updatedFee?.due_amount || newDueAmount,
        status: newStatus,
        tuition_fee: updatedFee?.tuition_fee,
        exam_fee: updatedFee?.exam_fee,
        annual_fee: updatedFee?.annual_fee,
        computer_fee: updatedFee?.computer_fee,
        transport_fee: updatedFee?.transport_fee,
        previous_due: updatedFee?.previous_due,
        breakdown: updatedFee?.breakdown,
        created_at: updatedFee?.created_at || feeRecord.created_at,
      },
      payment: {
        amount_paid: amount_paid,
        payment_mode: payment_mode.toLowerCase(),
        payment_date: payment_date || new Date().toISOString().split("T")[0],
      },
      payment_summary: {
        total_paid: newTotalPaid,
        remaining: newDueAmount > 0 ? newDueAmount : 0,
        status: newStatus,
        advance: advanceAmount, // Advance amount from this payment
        total_paid_advance: totalPaidAdvance, // Total active advance for student
        amount_for_fee: amountForFee, // Amount applied to fee
        amount_as_advance: advanceAmount, // Amount saved as advance
      },
      advance_ledger_entry: advanceLedgerEntry, // Advance ledger entry if created
    });
  } catch (error) {
    console.error("Error recording payment:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Get invoice details
 * GET /api/fees/invoice/:bill_id
 */
export const getInvoice = async (req, res) => {
  try {
    const { bill_id } = req.params;

    if (!bill_id) {
      return res.status(400).json({
        message: "bill_id is required",
      });
    }

    // Get bill with student details
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
          section
        )
      `
      )
      .eq("id", bill_id)
      .single();

    if (billError || !bill) {
      return res.status(404).json({
        message: "Bill not found",
      });
    }

    // Get bill items
    const { data: billItems, error: itemsError } = await supabase
      .from("fee_bill_items")
      .select("*")
      .eq("bill_id", bill_id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      return res.status(500).json({
        message: "Failed to fetch bill items",
        error: itemsError.message,
      });
    }

    // Get payments
    const { data: payments, error: paymentsError } = await supabase
      .from("fee_payments")
      .select("*")
      .eq("bill_id", bill_id)
      .order("payment_date", { ascending: false });

    if (paymentsError) {
      return res.status(500).json({
        message: "Failed to fetch payments",
        error: paymentsError.message,
      });
    }

    const totalPaid = payments?.reduce((sum, p) => sum + (p.amount_paid || 0), 0) || 0;
    const remaining = bill.total_amount - totalPaid;

    res.json({
      message: "Invoice fetched successfully",
      invoice: {
        bill_id: bill.id,
        invoice_number: `INV-${bill.id.substring(0, 8).toUpperCase()}`,
        date: bill.created_at,
        student: bill.students,
        items: billItems || [],
        payments: payments || [],
        total_amount: bill.total_amount,
        total_paid: totalPaid,
        remaining: remaining,
        status: bill.bill_status,
        month: bill.month,
        year: bill.year,
      },
    });
  } catch (error) {
    console.error("Error getting invoice:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

