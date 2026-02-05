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

/**
 * Generate professional invoice PDF for a single bill
 * @param {Object} invoiceData - Invoice data with bill, student, items, payments
 * @returns {Promise<Buffer>} PDF buffer
 */
export const generateInvoicePDF = async (invoiceData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
      });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on("error", reject);

      const pageWidth = 595.28;
      const margin = 50;
      const contentWidth = pageWidth - 2 * margin;

      // Header Section
      doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .fillColor("#1a1a1a")
        .text("INVOICE", margin, 50, { align: "left" });

      // School Details (customize these)
      doc
        .fontSize(12)
        .font("Helvetica")
        .fillColor("#666666")
        .text("School Management System", margin, 80)
        .text("123 School Street", margin, 95)
        .text("City, State - 123456", margin, 110)
        .text("Phone: +91 1234567890", margin, 125)
        .text("Email: info@school.com", margin, 140);

      // Invoice Number and Date (Right aligned)
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#333333")
        .text(`Invoice #: ${invoiceData.invoice_number}`, margin, 80, {
          align: "right",
          width: contentWidth,
        })
        .text(`Date: ${formatDate(invoiceData.date)}`, margin, 95, {
          align: "right",
          width: contentWidth,
        })
        .text(`Month: ${formatMonth(invoiceData.month)}`, margin, 110, {
          align: "right",
          width: contentWidth,
        });

      let currentY = 180;

      // Separator line
      doc
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .strokeColor("#cccccc")
        .lineWidth(1)
        .stroke();
      currentY += 20;

      // Bill To Section
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .fillColor("#1a1a1a")
        .text("Bill To:", margin, currentY);
      currentY += 20;

      const student = invoiceData.student;
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#333333")
        .text(`Student: ${student?.name || "N/A"}`, margin, currentY)
        .text(`Roll No: ${student?.roll_no || "N/A"}`, margin, currentY + 15)
        .text(`Class: ${student?.class || "N/A"} - ${student?.section || "N/A"}`, margin, currentY + 30)
        .text(`Father Name: ${student?.father_name || "N/A"}`, margin, currentY + 45);

      currentY += 80;

      // Separator line
      doc
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .strokeColor("#cccccc")
        .lineWidth(1)
        .stroke();
      currentY += 20;

      // Fee Items Table Header
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#ffffff")
        .rect(margin, currentY, contentWidth, 25)
        .fill("#2c3e50")
        .fillColor("#ffffff")
        .text("Fee Description", margin + 10, currentY + 8)
        .text("Amount", pageWidth - margin - 100, currentY + 8, { align: "right", width: 90 });

      currentY += 25;

      // Fee Items
      doc.fontSize(9).font("Helvetica").fillColor("#333333");
      invoiceData.items.forEach((item, index) => {
        const bgColor = index % 2 === 0 ? "#f8f9fa" : "#ffffff";
        doc
          .rect(margin, currentY, contentWidth, 20)
          .fill(bgColor)
          .fillColor("#333333")
          .text(item.fee_name, margin + 10, currentY + 6)
          .text(`Rs. ${parseFloat(item.amount).toFixed(2)}`, pageWidth - margin - 100, currentY + 6, {
            align: "right",
            width: 90,
          });
        currentY += 20;
      });

      // Total Section
      currentY += 10;
      doc
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .strokeColor("#cccccc")
        .lineWidth(1)
        .stroke();
      currentY += 15;

      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor("#1a1a1a")
        .text("Total Amount:", margin, currentY)
        .text(`Rs. ${parseFloat(invoiceData.total_amount).toFixed(2)}`, pageWidth - margin - 100, currentY, {
          align: "right",
          width: 90,
        });
      currentY += 25;

      // Payment Section
      if (invoiceData.payments && invoiceData.payments.length > 0) {
        doc
          .fontSize(10)
          .font("Helvetica-Bold")
          .fillColor("#1a1a1a")
          .text("Payments:", margin, currentY);
        currentY += 20;

        doc.fontSize(9).font("Helvetica").fillColor("#333333");
        invoiceData.payments.forEach((payment) => {
          doc
            .text(
              `${formatDate(payment.payment_date)} - ${payment.payment_mode.toUpperCase()} - Rs. ${parseFloat(payment.amount_paid).toFixed(2)}`,
              margin + 10,
              currentY
            );
          currentY += 15;
        });

        currentY += 10;
      }

      // Summary Section
      doc
        .moveTo(margin, currentY)
        .lineTo(pageWidth - margin, currentY)
        .strokeColor("#cccccc")
        .lineWidth(1)
        .stroke();
      currentY += 20;

      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#333333")
        .text(`Total Paid: Rs. ${parseFloat(invoiceData.total_paid || 0).toFixed(2)}`, margin, currentY)
        .text(`Remaining: Rs. ${parseFloat(invoiceData.remaining || 0).toFixed(2)}`, margin, currentY + 20);

      // Status Badge
      const status = invoiceData.status || "unpaid";
      const statusColor =
        status === "paid" ? "#27ae60" : status === "partial" ? "#f39c12" : "#e74c3c";
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#ffffff")
        .roundedRect(pageWidth - margin - 80, currentY, 70, 20, 3)
        .fill(statusColor)
        .fillColor("#ffffff")
        .text(status.toUpperCase(), pageWidth - margin - 75, currentY + 6, { width: 60, align: "center" });

      currentY += 50;

      // Footer
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor("#999999")
        .text("Thank you for your payment!", margin, currentY, { align: "center", width: contentWidth })
        .text("This is a computer-generated invoice.", margin, currentY + 15, {
          align: "center",
          width: contentWidth,
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate bills PDF for new billing system
 * @param {string} className - Class name
 * @param {string} month - Month in YYYY-MM format
 * @param {string} section - Optional section
 * @returns {Promise<Buffer>} PDF buffer
 */
export const generateBillsPDFForBilling = async (className, month, section = null) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Fetch bills for the month
      let billQuery = supabase
        .from("fee_bills")
        .select(
          `
          *,
          students (
            name,
            class,
            section,
            roll_no,
            father_name
          )
        `
        )
        .eq("month", month);

      if (className) {
        // Get students in class first
        let studentQuery = supabase.from("students").select("id").eq("class", className);
        if (section) {
          studentQuery = studentQuery.eq("section", section);
        }
        const { data: students } = await studentQuery;
        const studentIds = students?.map((s) => s.id) || [];
        if (studentIds.length > 0) {
          billQuery = billQuery.in("student_id", studentIds);
        } else {
          return reject(new Error("No students found"));
        }
      }

      const { data: bills, error } = await billQuery;

      if (error) {
        reject(new Error(`Failed to fetch bills: ${error.message}`));
        return;
      }

      if (!bills || bills.length === 0) {
        reject(new Error("No bills found for the specified criteria"));
        return;
      }

      // Sort bills by class and roll number
      bills.sort((a, b) => {
        const classA = a.students?.class || "";
        const classB = b.students?.class || "";
        if (classA !== classB) {
          return classA.localeCompare(classB);
        }
        const rollA = a.students?.roll_no || "";
        const rollB = b.students?.roll_no || "";
        return rollA.localeCompare(rollB);
      });

      // Get bill items for all bills
      const billIds = bills.map((b) => b.id);
      const { data: allBillItems, error: itemsError } = await supabase
        .from("fee_bill_items")
        .select("*")
        .in("bill_id", billIds);

      if (itemsError) {
        reject(new Error(`Failed to fetch bill items: ${itemsError.message}`));
        return;
      }

      // Group items by bill_id
      const itemsByBill = {};
      allBillItems?.forEach((item) => {
        if (!itemsByBill[item.bill_id]) {
          itemsByBill[item.bill_id] = [];
        }
        itemsByBill[item.bill_id].push(item);
      });

      // Get payments for all bills
      const { data: allPayments, error: paymentsError } = await supabase
        .from("fee_payments")
        .select("*")
        .in("bill_id", billIds);

      if (paymentsError) {
        reject(new Error(`Failed to fetch payments: ${paymentsError.message}`));
        return;
      }

      // Group payments by bill_id
      const paymentsByBill = {};
      allPayments?.forEach((payment) => {
        if (!paymentsByBill[payment.bill_id]) {
          paymentsByBill[payment.bill_id] = [];
        }
        paymentsByBill[payment.bill_id].push(payment);
      });

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
      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 20;
      const usableWidth = pageWidth - 2 * margin;
      const usableHeight = pageHeight - 2 * margin;

      // Bill dimensions (2x2 grid = 4 bills per page)
      const billWidth = usableWidth / 2 - 5;
      const billHeight = usableHeight / 2 - 5;

      // Process bills in batches of 4
      for (let i = 0; i < bills.length; i += 4) {
        const batch = bills.slice(i, i + 4);

        // Add new page for each batch of 4
        if (i > 0) {
          doc.addPage();
        }

        // Draw 4 bills on the page
        batch.forEach((bill, index) => {
          const row = Math.floor(index / 2);
          const col = index % 2;

          const x = margin + col * (billWidth + 10);
          const y = margin + row * (billHeight + 10);

          const billItems = itemsByBill[bill.id] || [];
          const billPayments = paymentsByBill[bill.id] || [];
          const totalPaid = billPayments.reduce((sum, p) => sum + (p.amount_paid || 0), 0);

          drawBillForBilling(doc, bill, billItems, totalPaid, x, y, billWidth, billHeight);
        });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Draw a single bill for new billing system
 */
const drawBillForBilling = (doc, bill, items, totalPaid, x, y, width, height) => {
  const student = bill.students;
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

  // School name
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
  doc.font("Helvetica").text(`${student?.class || "N/A"} - ${student?.section || "N/A"}`, x + padding + 60, currentY);
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
  doc.font("Helvetica").text(formatMonth(bill.month), x + padding + 60, currentY);
  currentY += lineHeight;

  // Fee breakdown from items
  doc.fontSize(8).font("Helvetica");
  items.forEach((item) => {
    doc.text(`${item.fee_name}:`, x + padding, currentY);
    doc.text(`Rs. ${parseFloat(item.amount).toFixed(2)}`, x + width - padding - 50, currentY, {
      align: "right",
    });
    currentY += lineHeight - 3;
  });

  currentY += 5;

  // Separator line
  doc.moveTo(x + padding, currentY).lineTo(x + width - padding, currentY).stroke();
  currentY += 10;

  // Total fee
  doc.fontSize(10).font("Helvetica-Bold");
  doc.text("Total Fee:", x + padding, currentY);
  doc.text(`Rs. ${parseFloat(bill.total_amount).toFixed(2)}`, x + width - padding - 50, currentY, {
    align: "right",
  });
  currentY += lineHeight + 2;

  // Paid amount
  doc.fontSize(9).font("Helvetica");
  doc.text("Paid Amount:", x + padding, currentY);
  doc.text(`Rs. ${totalPaid.toFixed(2)}`, x + width - padding - 50, currentY, {
    align: "right",
  });
  currentY += lineHeight + 2;

  // Remaining amount
  const remaining = bill.total_amount - totalPaid;
  doc.fontSize(10).font("Helvetica-Bold");
  doc.text("Remaining:", x + padding, currentY);
  doc.text(`Rs. ${remaining.toFixed(2)}`, x + width - padding - 50, currentY, {
    align: "right",
  });
  currentY += lineHeight + 5;

  // Status
  doc.fontSize(9);
  const status = bill.bill_status || "unpaid";
  const statusColor = status === "paid" ? "green" : status === "partial" ? "orange" : "red";
  doc.fillColor(statusColor);
  doc.font("Helvetica-Bold").text(`Status: ${status.toUpperCase()}`, x + padding, currentY);
  doc.fillColor("black");

  // Bill ID
  currentY += lineHeight;
  doc.fontSize(7).font("Helvetica");
  doc.text(`Bill ID: ${bill.id.substring(0, 8)}`, x + padding, currentY);
};

/**
 * Format date to readable string
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

