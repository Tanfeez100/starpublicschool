import { supabase } from "../services/supabase.js";
import { generateInvoicePDF } from "../services/pdfGenerator.js";

/**
 * Download invoice as PDF
 * GET /api/invoice/download/:bill_id
 */
export const downloadInvoice = async (req, res) => {
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
          section,
          uses_transport,
          transport_charge
        )
      `
      )
      .eq("id", bill_id)
      .single();

    if (billError || !bill) {
      return res.status(404).json({ message: 'Bill not found' });
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

    const finalBillItems = billItems ? [...billItems] : [];
    const studentObj = bill.students || {};
    const isStudentUsingTransport = Boolean(
      studentObj.uses_transport === true ||
      String(studentObj.uses_transport).toLowerCase() === 'true' ||
      studentObj.uses_transport === 1
    );
    const transportChargeAmt = parseFloat(studentObj.transport_charge || 0);
    const transportIdx = finalBillItems.findIndex(i => (i.fee_name || "").toLowerCase().includes("transport"));

    if (isStudentUsingTransport && transportChargeAmt > 0) {
      if (transportIdx >= 0) {
        if (parseFloat(finalBillItems[transportIdx].amount || 0) === 0) {
          finalBillItems[transportIdx] = { ...finalBillItems[transportIdx], amount: transportChargeAmt };
        }
      } else {
        finalBillItems.push({ fee_name: "Transport Fee", amount: transportChargeAmt });
      }
    }

    const totalPaid = payments?.reduce((sum, p) => sum + (p.amount_paid || 0), 0) || 0;
    const computedItemsTotal = finalBillItems.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    const effectiveTotal = Math.max(parseFloat(bill.total_amount || 0), computedItemsTotal);
    const remaining = Math.max(0, effectiveTotal - parseFloat(totalPaid || 0));

    // Prepare invoice data
    const invoiceData = {
      invoice_number: `INV-${bill.id.substring(0, 8).toUpperCase()}`,
      date: bill.created_at,
      month: bill.month,
      student: bill.students,
      items: finalBillItems,
      payments: payments || [],
      total_amount: effectiveTotal,
      total_paid: totalPaid,
      remaining: remaining,
      status: bill.bill_status,
    };

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="fee-receipt-${invoiceData.invoice_number}-${bill.students?.name || "student"}.pdf"`
    );

    // Send PDF
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Error downloading invoice:", error);
    res.status(500).json({
      message: "Failed to generate invoice PDF",
      error: error.message,
    });
  }
};

