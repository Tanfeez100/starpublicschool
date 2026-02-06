import { supabase } from "../services/supabase.js";
import { calculatePreviousDue } from "../utils/feeHelper.js";
import { adminOnly } from "../middleware/auth.middleware.js";

/**
 * Generate bulk bills with checkbox options
 * POST /api/billing/generate-bulk
 * Body: {
 *   class: "Class Name",
 *   section?: "Section Name", // Optional, not required
 *   month: "YYYY-MM",
 *   includeAnnualFee: boolean,
 *   includeExamFee: boolean,
 *   includeComputerFee: boolean,
 *   includeOptionalFees: boolean
 * }
 */
// Add admin authorization middleware to bulk bill generation
export const generateBulkBills = [
  adminOnly,
  async (req, res) => {
  try {
    const {
      class: className,
      // section removed, not required
      month,
      includeAnnualFee = false,
      includeExamFee = false,
      includeComputerFee = false,
    } = req.body;

    // Validation
    if (!className || !month) {
      return res.status(400).json({
        message: "class and month are required",
      });
    }

    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM (e.g., 2024-01)",
      });
    }

    const [year, monthNum] = month.split("-").map(Number);

    // Get students in the class (section not required)
    let studentQuery = supabase
      .from("students")
      .select("id, name, class, roll_no")
      .eq("class", className);

    // section filter removed

    const { data: students, error: studentsError } = await studentQuery;

    if (studentsError) {
      return res.status(500).json({
        message: "Failed to fetch students",
        error: studentsError.message,
      });
    }

    if (!students || students.length === 0) {
      return res.status(404).json({
        message: "No students found in this class",
      });
    }

    // Get fee structures for the class
    let feeStructureQuery = supabase
      .from("fee_structure")
      .select("*")
      .eq("class", className);

    // section filter removed from fee structure query

    const { data: feeStructures, error: fsError } = await feeStructureQuery;

    if (fsError) {
      return res.status(500).json({
        message: "Failed to fetch fee structures",
        error: fsError.message,
      });
    }

    if (!feeStructures || feeStructures.length === 0) {
      return res.status(404).json({
        message: "No fee structure found for this class",
      });
    }

    // Filter fee structures based on checkbox options
    const selectedFees = feeStructures.filter((fs) => {
      if (!fs.fee_name || typeof fs.fee_name !== "string") {
        return false;
      }
      const feeNameLower = fs.fee_name.toLowerCase();

      // Always include tuition fee (required)
      if (feeNameLower.includes("tuition")) {
        return true;
      }

      // Check checkbox options
      if (includeAnnualFee && feeNameLower.includes("annual")) {
        return true;
      }

      if (includeExamFee && feeNameLower.includes("exam")) {
        return true;
      }

      if (includeComputerFee && feeNameLower.includes("computer")) {
        return true;
      }

      // If none of the above, don't include
      return false;
    });

    if (selectedFees.length === 0) {
      return res.status(400).json({
        message: "No fees selected. Please select at least one fee type.",
      });
    }

    // Calculate total fee amount from selected fees
    const baseFeeAmount = selectedFees.reduce((sum, fs) => sum + (fs.fee_amount || 0), 0);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Generate bills for all students
    const billPromises = students.map(async (student) => {
      try {
        // Calculate previous due
        const previousDue = await calculatePreviousDue(student.id, month);

        // Calculate total amount
        const totalAmount = baseFeeAmount + previousDue;

        // Check if bill already exists
        const { data: existingBill } = await supabase
          .from("fee_bills")
          .select("id, total_amount")
          .eq("student_id", student.id)
          .eq("month", month)
          .single();

        let billId;

        if (existingBill) {
          // Update existing bill
          billId = existingBill.id;
          const { error: updateError } = await supabase
            .from("fee_bills")
            .update({
              total_amount: totalAmount,
              year,
              updated_at: new Date().toISOString(),
            })
            .eq("id", billId);

          if (updateError) {
            errorCount++;
            errors.push(`Failed to update bill for ${student.name}: ${updateError.message}`);
            return;
          }

          // Delete existing bill items
          await supabase.from("fee_bill_items").delete().eq("bill_id", billId);
        } else {
          // Create new bill
          const { data: newBill, error: createError } = await supabase
            .from("fee_bills")
            .insert([
              {
                student_id: student.id,
                month,
                year,
                total_amount: totalAmount,
                bill_status: "unpaid",
              },
            ])
            .select()
            .single();

          if (createError) {
            errorCount++;
            errors.push(`Failed to create bill for ${student.name}: ${createError.message}`);
            return;
          }

          billId = newBill.id;
        }

        // Create bill items
        const billItems = selectedFees.map((fs) => ({
          bill_id: billId,
          fee_name: fs.fee_name,
          amount: fs.fee_amount,
        }));

        // Add previous due as a bill item if exists
        if (previousDue > 0) {
          billItems.push({
            bill_id: billId,
            fee_name: "Previous Due",
            amount: previousDue,
          });
        }

        const { error: itemsError } = await supabase
          .from("fee_bill_items")
          .insert(billItems);

        if (itemsError) {
          errorCount++;
          errors.push(`Failed to create bill items for ${student.name}: ${itemsError.message}`);
          return;
        }

        successCount++;
      } catch (error) {
        errorCount++;
        errors.push(`Error processing ${student.name}: ${error.message}`);
      }
    });

    await Promise.all(billPromises);

    res.json({
      message: "Bulk bills generation completed",
      month,
      class: className,
      // section removed, not required
      totalStudents: students.length,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error generating bulk bills:", error);
    res.status(500).json({
      message: "Failed to generate bulk bills",
      error: error.message,
    });
  }
  }
];

/**
 * Get a single bill by ID
 * GET /api/billing/bill/:id
 */
export const getBill = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: "Bill ID is required",
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
          // section removed
        )
      `
      )
      .eq("id", id)
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
      .eq("bill_id", id)
      .order("created_at", { ascending: true });

    if (itemsError) {
      return res.status(500).json({
        message: "Failed to fetch bill items",
        error: itemsError.message,
      });
    }

    // Get payments for this bill
    const { data: payments, error: paymentsError } = await supabase
      .from("fee_payments")
      .select("*")
      .eq("bill_id", id)
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
      message: "Bill fetched successfully",
      data: {
        ...bill,
        items: billItems || [],
        payments: payments || [],
        total_paid: totalPaid,
        remaining: remaining,
      },
    });
  } catch (error) {
    console.error("Error getting bill:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Download bills as PDF
 * GET /api/billing/download?class=&month=
 */
export const downloadBills = async (req, res) => {
  try {
    const { class: className, month } = req.query;

    if (!className || !month) {
      return res.status(400).json({
        message: "class and month are required",
      });
    }

    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM (e.g., 2024-01)",
      });
    }

    // Import PDF generator
    const { generateBillsPDFForBilling } = await import("../services/pdfGenerator.js");

    // Generate PDF
    const pdfBuffer = await generateBillsPDFForBilling(className, month);

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bills-${className}-${month}.pdf"`
    );

    // Send PDF
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error downloading bills:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

