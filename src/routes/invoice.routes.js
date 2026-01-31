import express from "express";
import { getInvoiceById } from "../controllers/invoice.controller.js";
import { supabase } from "../services/supabase.js";
import { adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * GET /api/invoice/:id
 * Fetch single fee invoice with student details
 * Admin Only
 */


// GET /api/fees/invoice/:id - fetch invoice by id with student info
router.get("/invoice/:id", adminOnly, async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from("fees")
    .select(`
      id,
      month,
      total_fee,
      paid_amount,
      status,
      created_at,
      tuition_fee,
      exam_fee,
      annual_fee,
      transport_fee,
      computer_fee,
      fine,
      advance,
      breakdown,
      students (
        name,
        class,
        roll_no,
        father_name
      )
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "Invoice not found" });
  }
  res.json(data);
});

export default router;
