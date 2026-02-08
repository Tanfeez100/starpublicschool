import { generateBillsPDF } from "../services/pdfGenerator.js";
import { createClient } from "@supabase/supabase-js";
import { calculatePreviousDue } from "../utils/feeHelper.js";

// Admin client for bill operations (uses service role key to bypass RLS)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Generate PDF with all bills for a given month
 * GET /api/bills/pdf?month=YYYY-MM
 */
export const generateBillsPDFController = async (req, res) => {
  try {
    const { month } = req.query;

    if (!month) {
      return res.status(400).json({
        message: "Month parameter is required (format: YYYY-MM)",
      });
    }

    // Validate month format (YYYY-MM)
    const monthRegex = /^\d{4}-\d{2}$/;
    if (!monthRegex.test(month)) {
      return res.status(400).json({
        message: "Invalid month format. Use YYYY-MM (e.g., 2024-01)",
      });
    }

    // Generate PDF
    const pdfBuffer = await generateBillsPDF(month);

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bills-${month}.pdf"`
    );

    // Send PDF
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Generate bills for all students in all classes for a given month
 * POST /api/bills/generate-all
 * Body: { month: "YYYY-MM" }
 */
export const generateBillsForAll = async (req, res) => {
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

    // Using supabase service with service role key (bypasses RLS)

    // Get all students with transport info
    const { data: students, error: studentsError } = await supabaseAdmin
      .from("students")
      .select("id, class, uses_transport, transport_charge");

    if (studentsError) {
      return res.status(500).json({
        message: "Failed to fetch students",
        error: studentsError.message,
      });
    }

    if (!students || students.length === 0) {
      return res.status(404).json({
        message: "No students found",
      });
    }

    // Get all fee structures
    const { data: feeStructures, error: fsError } = await supabaseAdmin
      .from("fee_structure")
      .select("*");

    if (fsError) {
      return res.status(500).json({
        message: "Failed to fetch fee structures",
        error: fsError.message,
      });
    }

    // Create a map of class to fee structure
    const feeStructureMap = {};
    feeStructures.forEach((fs) => {
      feeStructureMap[fs.class] = fs;
    });

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Generate fees for all students
    const feePromises = students.map(async (student) => {
      const feeStructure = feeStructureMap[student.class];

      if (!feeStructure) {
        errorCount++;
        errors.push(`No fee structure for class ${student.class}`);
        return;
      }

      try {
        // Extract fees from fee structure
        const tuitionFee = parseFloat(feeStructure.tuition_fee || 0);
        const examFee = parseFloat(feeStructure.exam_fee || 0);
        const annualFee = parseFloat(feeStructure.annual_fee || 0);
        const computerFee = parseFloat(feeStructure.computer_fee || 0);

        // Calculate transport fee if student uses transport
        const transportFee = student.uses_transport && student.transport_charge 
          ? parseFloat(student.transport_charge) 
          : 0;

        const previousDue = await calculatePreviousDue(student.id, month);
        const currentMonthFees = tuitionFee + examFee + annualFee + computerFee + transportFee;
        const totalFee = currentMonthFees + previousDue;

        // Check if fee already exists
        const { data: existingFee } = await supabaseAdmin
          .from("fees")
          .select("paid_amount, due_amount, status")
          .eq("student_id", student.id)
          .eq("month", month)
          .maybeSingle();

        // Calculate due amount
        const paidAmount = existingFee?.paid_amount || 0;
        const dueAmount = totalFee - paidAmount;

        // Determine status
        let status = "DUE";
        if (paidAmount >= totalFee) {
          status = "PAID";
        } else if (paidAmount > 0) {
          status = "PARTIAL";
        } else if (paidAmount < 0) {
          status = "ADVANCE";
        }

        const feeData = {
          student_id: student.id,
          month,
          tuition_fee: tuitionFee,
          exam_fee: examFee,
          annual_fee: annualFee,
          computer_fee: computerFee,
          transport_fee: transportFee,
          previous_due: previousDue,
          total_fee: totalFee,
          paid_amount: paidAmount,
          due_amount: dueAmount,
          status: status,
          fine: 0,
          fine_amount: 0,
          fine_waived: false,
          fine_waived_amount: 0,
          advance: 0,
          breakdown: {
            tuition_fee: tuitionFee,
            exam_fee: examFee,
            annual_fee: annualFee,
            computer_fee: computerFee,
            transport_fee: transportFee,
            previous_due: previousDue,
          },
        };

        const { error } = await supabaseAdmin
          .from("fees")
          .upsert(feeData, { 
            onConflict: "student_id,month",
            ignoreDuplicates: false 
          });

        if (error) {
          errorCount++;
          errors.push(`Failed for student ${student.id}: ${error.message}`);
        } else {
          successCount++;
        }
      } catch (error) {
        errorCount++;
        errors.push(`Error processing student ${student.id}: ${error.message}`);
      }
    });

    await Promise.all(feePromises);

    res.json({
      message: `Bills generation completed`,
      month,
      totalStudents: students.length,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error generating bills:", error);
    res.status(500).json({
      message: "Failed to generate bills",
      error: error.message,
    });
  }
};

/**
 * Generate bills for all students in a class for a given month
 * POST /api/bills/generate
 * Body: { class: "Class Name", month: "YYYY-MM" }
 */
export const generateBillsForClass = async (req, res) => {
  try {
    const { class: className, month } = req.body;

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

    // Using supabase service with service role key (bypasses RLS)

    // Get all students in the class with transport info
    const { data: students, error: studentsError } = await supabaseAdmin
      .from("students")
      .select("id, class, uses_transport, transport_charge")
      .eq("class", className);

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

    // Get fee structure for the class
    const { data: feeStructure, error: fsError } = await supabaseAdmin
      .from("fee_structure")
      .select("*")
      .eq("class", className)
      .single();

    if (fsError || !feeStructure) {
      return res.status(404).json({
        message: "Fee structure not found for this class",
      });
    }

    // Extract fees from fee structure
    const tuitionFee = parseFloat(feeStructure.tuition_fee || 0);
    const examFee = parseFloat(feeStructure.exam_fee || 0);
    const annualFee = parseFloat(feeStructure.annual_fee || 0);
    const computerFee = parseFloat(feeStructure.computer_fee || 0);

    // Generate fees for all students
    const feePromises = students.map(async (student) => {
      try {
        // Calculate previous due
        const previousDue = await calculatePreviousDue(student.id, month);
        
        // Calculate transport fee if student uses transport
        const transportFee = student.uses_transport && student.transport_charge 
          ? parseFloat(student.transport_charge) 
          : 0;

        // Calculate total fee
        const currentMonthFees = tuitionFee + examFee + annualFee + computerFee + transportFee;
        const totalFee = currentMonthFees + previousDue;

        // Check if fee already exists
        const { data: existingFee } = await supabaseAdmin
          .from("fees")
          .select("paid_amount, due_amount, status")
          .eq("student_id", student.id)
          .eq("month", month)
          .maybeSingle();

        // Calculate due amount
        const paidAmount = existingFee?.paid_amount || 0;
        const dueAmount = totalFee - paidAmount;

        // Determine status
        let status = "DUE";
        if (paidAmount >= totalFee) {
          status = "PAID";
        } else if (paidAmount > 0) {
          status = "PARTIAL";
        } else if (paidAmount < 0) {
          status = "ADVANCE";
        }

        // Prepare fee data according to fees table structure
        const feeData = {
          student_id: student.id,
          month,
          tuition_fee: tuitionFee,
          exam_fee: examFee,
          annual_fee: annualFee,
          computer_fee: computerFee,
          transport_fee: transportFee,
          previous_due: previousDue,
          total_fee: totalFee,
          paid_amount: paidAmount,
          due_amount: dueAmount,
          status: status,
          fine: 0,
          fine_amount: 0,
          fine_waived: false,
          fine_waived_amount: 0,
          advance: 0,
          breakdown: {
            tuition_fee: tuitionFee,
            exam_fee: examFee,
            annual_fee: annualFee,
            computer_fee: computerFee,
            transport_fee: transportFee,
            previous_due: previousDue,
          },
        };

        // Upsert fee record using admin client (bypasses RLS)
        const { error: upsertError } = await supabaseAdmin
          .from("fees")
          .upsert(feeData, { 
            onConflict: "student_id,month",
            ignoreDuplicates: false 
          });

        if (upsertError) {
          console.error(`Error upserting fee for student ${student.id}:`, upsertError);
          throw new Error(upsertError.message);
        }

        return { success: true, student_id: student.id };
      } catch (error) {
        console.error(`Error processing student ${student.id}:`, error);
        return { success: false, student_id: student.id, error: error.message };
      }
    });

    // Execute all fee generation promises
    const results = await Promise.all(feePromises);
    
    // Count successes and errors
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    results.forEach((result) => {
      if (result?.success) {
        successCount++;
      } else {
        errorCount++;
        errors.push(`Failed for student ${result?.student_id}: ${result?.error || "Unknown error"}`);
      }
    });

    res.json({
      message: `Bills generated for ${successCount} students in class ${className}`,
      month,
      totalStudents: students.length,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error generating bills:", error);
    res.status(500).json({
      message: "Failed to generate bills",
      error: error.message,
    });
  }
};

