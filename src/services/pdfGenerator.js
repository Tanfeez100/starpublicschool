import PDFDocument from "pdfkit";
import { supabase } from "./supabase.js";

/**
 * Generate PDF with all bills for a given month
 * 4 bills per page layout
 * @param {string} month - Month in YYYY-MM format
 * @returns {Promise<Buffer>} PDF buffer
 */
export const generateBillsPDF = async (month) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Fetch all fees for the month with student details
      const { data: fees, error } = await supabase
        .from("fees")
        .select(
          `
          *,
          students (
            name,
            class,
            roll_no,
            father_name
          )
        `
        )
        .eq("month", month);

      // Sort fees by class and roll number
      if (fees && fees.length > 0) {
        fees.sort((a, b) => {
          const classA = a.students?.class || "";
          const classB = b.students?.class || "";
          if (classA !== classB) {
            return classA.localeCompare(classB);
          }
          const rollA = a.students?.roll_no || "";
          const rollB = b.students?.roll_no || "";
          return rollA.localeCompare(rollB);
        });
      }

      if (error) {
        reject(new Error(`Failed to fetch fees: ${error.message}`));
        return;
      }

      if (!fees || fees.length === 0) {
        reject(new Error("No fees found for the specified month"));
        return;
      }

      // Create PDF document
      const doc = new PDFDocument({
        size: "A4",
        margin: 20,
      });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on("error", reject);

      // Page dimensions
      const pageWidth = 595.28; // A4 width in points
      const pageHeight = 841.89; // A4 height in points
      const margin = 20;
      const usableWidth = pageWidth - 2 * margin;
      const usableHeight = pageHeight - 2 * margin;

      // Bill dimensions (2x2 grid)
      const billWidth = usableWidth / 2 - 5;
      const billHeight = usableHeight / 2 - 5;

      // Process fees in batches of 4
      for (let i = 0; i < fees.length; i += 4) {
        const batch = fees.slice(i, i + 4);

        // Add new page for each batch of 4
        if (i > 0) {
          doc.addPage();
        }

        // Draw 4 bills on the page
        batch.forEach((fee, index) => {
          const row = Math.floor(index / 2);
          const col = index % 2;

          const x = margin + col * (billWidth + 10);
          const y = margin + row * (billHeight + 10);

          drawBill(doc, fee, x, y, billWidth, billHeight);
        });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Draw a single bill on the PDF
 * @param {PDFKit} doc - PDF document
 * @param {Object} fee - Fee object with student details
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Bill width
 * @param {number} height - Bill height
 */
const drawBill = (doc, fee, x, y, width, height) => {
  const student = fee.students;
  const padding = 10;
  const lineHeight = 15;
  let currentY = y + padding;

  // Bill border
  doc.rect(x, y, width, height).stroke();

  // Header
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text("FEE BILL", x + padding, currentY, { width: width - 2 * padding, align: "center" });
  currentY += lineHeight + 5;

  // School name (optional - you can customize this)
  doc
    .fontSize(10)
    .font("Helvetica")
    .text("School Management System", x + padding, currentY, {
      width: width - 2 * padding,
      align: "center",
    });
  currentY += lineHeight + 10;

  // Separator line
  doc.moveTo(x + padding, currentY).lineTo(x + width - padding, currentY).stroke();
  currentY += 10;

  // Student details
  doc.fontSize(9).font("Helvetica-Bold");
  doc.text("Student Name:", x + padding, currentY);
  doc.font("Helvetica").text(student?.name || "N/A", x + padding + 60, currentY);
  currentY += lineHeight;

  doc.font("Helvetica-Bold").text("Roll No:", x + padding, currentY);
  doc.font("Helvetica").text(student?.roll_no || "N/A", x + padding + 60, currentY);
  currentY += lineHeight;

  doc.font("Helvetica-Bold").text("Class:", x + padding, currentY);
  doc.font("Helvetica").text(student?.class || "N/A", x + padding + 60, currentY);
  currentY += lineHeight;

  doc.font("Helvetica-Bold").text("Father Name:", x + padding, currentY);
  doc.font("Helvetica").text(student?.father_name || "N/A", x + padding + 60, currentY);
  currentY += lineHeight + 5;

  // Separator line
  doc.moveTo(x + padding, currentY).lineTo(x + width - padding, currentY).stroke();
  currentY += 10;

  // Fee details
  doc.fontSize(9).font("Helvetica-Bold");
  doc.text("Month:", x + padding, currentY);
  doc.font("Helvetica").text(formatMonth(fee.month), x + padding + 60, currentY);
  currentY += lineHeight;

  // Fee breakdown
  if (fee.tuition_fee) {
    doc.font("Helvetica").text("Tuition Fee:", x + padding, currentY);
    doc.text(`Rs. ${fee.tuition_fee.toFixed(2)}`, x + width - padding - 60, currentY, {
      align: "right",
    });
    currentY += lineHeight - 2;
  }

  if (fee.exam_fee) {
    doc.font("Helvetica").text("Exam Fee:", x + padding, currentY);
    doc.text(`Rs. ${fee.exam_fee.toFixed(2)}`, x + width - padding - 60, currentY, {
      align: "right",
    });
    currentY += lineHeight - 2;
  }

  if (fee.annual_fee) {
    doc.font("Helvetica").text("Annual Fee:", x + padding, currentY);
    doc.text(`Rs. ${fee.annual_fee.toFixed(2)}`, x + width - padding - 60, currentY, {
      align: "right",
    });
    currentY += lineHeight - 2;
  }

  // Previous due
  if (fee.previous_due && fee.previous_due > 0) {
    doc.font("Helvetica").text("Previous Due:", x + padding, currentY);
    doc.text(`Rs. ${fee.previous_due.toFixed(2)}`, x + width - padding - 60, currentY, {
      align: "right",
    });
    currentY += lineHeight - 2;
  }

  currentY += 5;

  // Separator line
  doc.moveTo(x + padding, currentY).lineTo(x + width - padding, currentY).stroke();
  currentY += 10;

  // Total fee
  doc.fontSize(10).font("Helvetica-Bold");
  doc.text("Total Fee:", x + padding, currentY);
  doc.text(`Rs. ${fee.total_fee.toFixed(2)}`, x + width - padding - 60, currentY, {
    align: "right",
  });
  currentY += lineHeight + 2;

  // Paid amount
  doc.fontSize(9).font("Helvetica");
  doc.text("Paid Amount:", x + padding, currentY);
  doc.text(`Rs. ${(fee.paid_amount || 0).toFixed(2)}`, x + width - padding - 60, currentY, {
    align: "right",
  });
  currentY += lineHeight + 2;

  // Remaining amount
  const remaining = fee.total_fee - (fee.paid_amount || 0);
  doc.fontSize(10).font("Helvetica-Bold");
  doc.text("Remaining:", x + padding, currentY);
  doc.text(`Rs. ${remaining.toFixed(2)}`, x + width - padding - 60, currentY, {
    align: "right",
  });
  currentY += lineHeight + 5;

  // Status
  doc.fontSize(9);
  const statusColor = fee.status === "PAID" ? "green" : fee.status === "PARTIAL" ? "orange" : "red";
  doc.fillColor(statusColor);
  doc.font("Helvetica-Bold").text(`Status: ${fee.status}`, x + padding, currentY);
  doc.fillColor("black");

  // Bill ID
  currentY += lineHeight;
  doc.fontSize(7).font("Helvetica");
  doc.text(`Bill ID: ${fee.id}`, x + padding, currentY);
};

/**
 * Format month from YYYY-MM to readable format
 * @param {string} month - Month in YYYY-MM format
 * @returns {string} Formatted month string
 */
const formatMonth = (month) => {
  if (!month) return "N/A";
  const [year, monthNum] = month.split("-");
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${monthNames[parseInt(monthNum) - 1]} ${year}`;
};

