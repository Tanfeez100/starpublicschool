import { generateBillsPDF } from "../services/pdfGenerator.js";

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

    const { supabase } = await import("../services/supabase.js");
    const { calculatePreviousDue } = await import("../utils/feeHelper.js");

    // Get all students
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id, class");

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
    const { data: feeStructures, error: fsError } = await supabase
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
        const currentMonthFees =
          feeStructure.tuition_fee +
          feeStructure.exam_fee +
          feeStructure.annual_fee;

        const previousDue = await calculatePreviousDue(student.id, month);
        const totalFee = currentMonthFees + previousDue;

        // Check if fee already exists
        const { data: existingFee } = await supabase
          .from("fees")
          .select("paid_amount")
          .eq("student_id", student.id)
          .eq("month", month)
          .single();

        const feeData = {
          student_id: student.id,
          month,
          tuition_fee: feeStructure.tuition_fee,
          exam_fee: feeStructure.exam_fee,
          annual_fee: feeStructure.annual_fee,
          previous_due: previousDue,
          total_fee: totalFee,
          paid_amount: existingFee?.paid_amount || 0,
          status:
            existingFee?.paid_amount >= totalFee
              ? "PAID"
              : existingFee?.paid_amount > 0
              ? "PARTIAL"
              : "DUE",
        };

        const { error } = await supabase
          .from("fees")
          .upsert(feeData, { onConflict: "student_id,month" });

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

    // Import here to avoid circular dependency
    const { supabase } = await import("../services/supabase.js");
    const { calculatePreviousDue } = await import("../utils/feeHelper.js");

    // Get all students in the class
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id, class")
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
    const { data: feeStructure, error: fsError } = await supabase
      .from("fee_structure")
      .select("*")
      .eq("class", className)
      .single();

    if (fsError || !feeStructure) {
      return res.status(404).json({
        message: "Fee structure not found for this class",
      });
    }

    const currentMonthFees =
      feeStructure.tuition_fee +
      feeStructure.exam_fee +
      feeStructure.annual_fee;

    // Generate fees for all students
    const feePromises = students.map(async (student) => {
      const previousDue = await calculatePreviousDue(student.id, month);
      const totalFee = currentMonthFees + previousDue;

      // Check if fee already exists
      const { data: existingFee } = await supabase
        .from("fees")
        .select("paid_amount")
        .eq("student_id", student.id)
        .eq("month", month)
        .single();

      const feeData = {
        student_id: student.id,
        month,
        tuition_fee: feeStructure.tuition_fee,
        exam_fee: feeStructure.exam_fee,
        annual_fee: feeStructure.annual_fee,
        previous_due: previousDue,
        total_fee: totalFee,
        paid_amount: existingFee?.paid_amount || 0,
        status:
          existingFee?.paid_amount >= totalFee
            ? "PAID"
            : existingFee?.paid_amount > 0
            ? "PARTIAL"
            : "DUE",
      };

      return supabase
        .from("fees")
        .upsert(feeData, { onConflict: "student_id,month" });
    });

    await Promise.all(feePromises);

    res.json({
      message: `Bills generated for ${students.length} students in class ${className}`,
      month,
      studentsCount: students.length,
    });
  } catch (error) {
    console.error("Error generating bills:", error);
    res.status(500).json({
      message: "Failed to generate bills",
      error: error.message,
    });
  }
};

