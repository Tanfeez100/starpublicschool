import { supabase } from "../services/supabase.js";

// Allowed standard fee names (for validation/helpful defaults)
const STANDARD_FEE_NAMES = [
  "Tuition Fee",
  "Exam Fee",
  "Computer Fee",
  "Annual Fee",
];

/**
 * Create a fee structure entry (normalized)
 * - One-time-per-class create: if any fee rows exist for the class, CREATE will be rejected.
 * - Fee rules are scoped to `class` only (section is ignored).
 * - Allowed fee types: Tuition Fee, Exam Fee, Annual Fee, Computer Fee.
 */
export const createFeeStructure = async (req, res) => {
  try {
    const {
      class: className,
      section,
      fee_name,
      fee_amount,
      is_optional = false,
      period = "monthly",
      // old-format compatibility
      tuition_fee,
      exam_fee,
      annual_fee,
      computer_fee,
      late_fine_enabled = false,
    } = req.body;

    // Support bulk normalized array payload: [{ class, fee_name, fee_amount, period?, is_optional?, late_fine_enabled? }, ...]
    if (Array.isArray(req.body)) {
      const rows = req.body;
      if (!rows || rows.length === 0) return res.status(400).json({ message: 'Request body must be a non-empty array' });

      // All items must include `class` and belong to the same class (single-class bulk)
      const classes = rows.map(r => r?.class).filter(Boolean);
      if (classes.length === 0) return res.status(400).json({ message: 'class is required in array items' });
      const uniqueClasses = [...new Set(classes)];
      if (uniqueClasses.length > 1) return res.status(400).json({ message: 'All items must belong to the same class' });

      const bulkClass = uniqueClasses[0];

      // Prevent duplicate 'create' for same class
      const { data: existingForBulk, error: existsBulkErr } = await supabase
        .from('fee_structures')
        .select('id')
        .eq('class', bulkClass)
        .limit(1)
        .maybeSingle();

      if (existsBulkErr) {
        console.error('Failed to check existing fee_structures (bulk):', existsBulkErr);
        return res.status(500).json({ message: 'Failed to validate existing fee structure', error: existsBulkErr.message });
      }
      if (existingForBulk) {
        return res.status(400).json({ message: `Fee structure already exists for class ${bulkClass}. Use UPDATE or DELETE to modify.` });
      }

      // Validate & normalize each row
      const insertRows = [];
      for (const r of rows) {
        if (!r || !r.fee_name || r.fee_amount === undefined) {
          return res.status(400).json({ message: 'Each item must include fee_name and fee_amount' });
        }
        if (typeof r.fee_amount !== 'number' || r.fee_amount < 0) {
          return res.status(400).json({ message: 'fee_amount must be a non-negative number' });
        }
        const periodValue = r.period || 'monthly';
        if (!['monthly', 'yearly'].includes(periodValue)) {
          return res.status(400).json({ message: "period must be 'monthly' or 'yearly'" });
        }
        const canonical = STANDARD_FEE_NAMES.find(n => n.toLowerCase() === String(r.fee_name).trim().toLowerCase());
        if (!canonical) {
          return res.status(400).json({ message: `Invalid fee_name. Allowed values: ${STANDARD_FEE_NAMES.join(', ')}` });
        }

        insertRows.push({
          class: bulkClass,
          section: null,
          fee_name: canonical,
          fee_amount: parseFloat(r.fee_amount),
          is_optional: !!r.is_optional,
          period: periodValue,
          late_fine_enabled: !!r.late_fine_enabled,
        });
      }

      const { data: inserted, error: insertErr } = await supabase.from('fee_structures').insert(insertRows).select();
      if (insertErr) return res.status(500).json({ message: 'Failed to create fee structures', error: insertErr.message });

      return res.status(201).json({ message: 'Fee structures created', count: inserted.length, data: inserted });
    }

    if (!className) return res.status(400).json({ message: "class is required" });

    // Section is ignored for fee rules (fee structures are per-class)
    // => Prevent duplicate 'create' for same class (use UPDATE/DELETE to change)
    const { data: existing, error: existsErr } = await supabase
      .from('fee_structures')
      .select('id')
      .eq('class', className)
      .limit(1)
      .maybeSingle();

    if (existsErr) {
      console.error('Failed to check existing fee_structures:', existsErr);
      return res.status(500).json({ message: 'Failed to validate existing fee structure', error: existsErr.message });
    }
    if (existing) {
      return res.status(400).json({ message: `Fee structure already exists for class ${className}. Use UPDATE or DELETE to modify.` });
    }

    // Old-format bulk insert (tuition, exam, annual, computer) - allowed only on first-time create
    if (
      tuition_fee !== undefined ||
      exam_fee !== undefined ||
      annual_fee !== undefined ||
      computer_fee !== undefined
    ) {
      // require numbers for all old-format keys (keeps API predictable)
      const fees = [tuition_fee ?? 0, exam_fee ?? 0, annual_fee ?? 0, computer_fee ?? 0];
      if (fees.some((f) => typeof f !== 'number' || f < 0)) {
        return res.status(400).json({ message: 'Old-format fees must be non-negative numbers' });
      }

      const rows = [];
      if (tuition_fee && tuition_fee > 0) rows.push({ class: className, section: null, fee_name: 'Tuition Fee', fee_amount: parseFloat(tuition_fee), is_optional: false, period: 'monthly', late_fine_enabled: !!late_fine_enabled });
      if (exam_fee && exam_fee > 0) rows.push({ class: className, section: null, fee_name: 'Exam Fee', fee_amount: parseFloat(exam_fee), is_optional: true, period: 'monthly', late_fine_enabled: !!late_fine_enabled });
      if (computer_fee && computer_fee > 0) rows.push({ class: className, section: null, fee_name: 'Computer Fee', fee_amount: parseFloat(computer_fee), is_optional: true, period: 'monthly', late_fine_enabled: !!late_fine_enabled });
      if (annual_fee && annual_fee > 0) rows.push({ class: className, section: null, fee_name: 'Annual Fee', fee_amount: parseFloat(annual_fee), is_optional: true, period: 'yearly', late_fine_enabled: !!late_fine_enabled });

      if (rows.length === 0) return res.status(400).json({ message: 'No non-zero fee values provided' });

      const { data, error } = await supabase.from('fee_structures').insert(rows).select();
      if (error) return res.status(500).json({ message: 'Failed to create fee structures', error: error.message });

      return res.status(201).json({ message: 'Fee structures created', count: data.length, data });
    }

    // Normalized single-row creation - allowed only as the initial create for the class
    if (!fee_name || fee_amount === undefined) {
      return res.status(400).json({ message: 'fee_name and fee_amount are required' });
    }
    if (typeof fee_amount !== 'number' || fee_amount < 0) {
      return res.status(400).json({ message: 'fee_amount must be a non-negative number' });
    }
    if (!['monthly', 'yearly'].includes(period)) {
      return res.status(400).json({ message: "period must be 'monthly' or 'yearly'" });
    }

    // Allow only standard fee types
    const canonical = STANDARD_FEE_NAMES.find(n => n.toLowerCase() === String(fee_name).trim().toLowerCase());
    if (!canonical) {
      return res.status(400).json({ message: `Invalid fee_name. Allowed values: ${STANDARD_FEE_NAMES.join(', ')}` });
    }

    const insertRow = {
      class: className,
      section: null, // section ignored
      fee_name: canonical,
      fee_amount: parseFloat(fee_amount),
      is_optional: !!is_optional,
      period,
      late_fine_enabled: !!late_fine_enabled,
    };

    const { data, error } = await supabase.from('fee_structures').insert([insertRow]).select().single();
    if (error) return res.status(500).json({ message: 'Failed to create fee structure', error: error.message });

    res.status(201).json({ message: 'Fee structure created successfully', data });
  } catch (err) {
    console.error('createFeeStructure error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

/**
 * GET /api/fee-structure?class=&period=
 * Returns fee structures (section is ignored — fee rules are per-class)
 */
export const getFeeStructures = async (req, res) => {
  try {
    const { class: className, period } = req.query;

    let q = supabase.from("fee_structures").select("*");
    if (className) q = q.eq("class", className);
    // section intentionally ignored (fee rules are per-class)
    if (period) q = q.eq("period", period);

    q = q.order("class", { ascending: true }).order("fee_name", { ascending: true });

    const { data, error } = await q;
    if (error) return res.status(500).json({ message: "Failed to fetch fee structures", error: error.message });

    res.json({ message: "Fee structures fetched", count: data?.length || 0, data });
  } catch (err) {
    console.error("getFeeStructures error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Update a fee_structure row by id
 * Supports changing fee_amount, fee_name, is_optional, period and section
 */
export const updateFeeStructure = async (req, res) => {
  try {
    const { id } = req.params;
    const { fee_name, fee_amount, is_optional, period, section, late_fine_enabled } = req.body;
    if (!id) return res.status(400).json({ message: "id is required" });

    const update = {};
    if (fee_name !== undefined) update.fee_name = fee_name;
    if (fee_amount !== undefined) {
      if (typeof fee_amount !== "number" || fee_amount < 0) return res.status(400).json({ message: "fee_amount must be non-negative" });
      update.fee_amount = parseFloat(fee_amount);
    }
    if (is_optional !== undefined) update.is_optional = !!is_optional;
    if (period !== undefined) {
      if (!["monthly", "yearly"].includes(period)) return res.status(400).json({ message: "period must be 'monthly' or 'yearly'" });
      update.period = period;
    }
    if (section !== undefined) update.section = section || null;
    if (late_fine_enabled !== undefined) update.late_fine_enabled = !!late_fine_enabled;

    if (Object.keys(update).length === 0) return res.status(400).json({ message: "No fields to update" });

    const { data, error } = await supabase.from("fee_structures").update(update).eq("id", id).select().single();
    if (error) return res.status(500).json({ message: "Failed to update fee structure", error: error.message });

    res.json({ message: "Fee structure updated", data });
  } catch (err) {
    console.error("updateFeeStructure error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * Delete a fee_structure row
 */
export const deleteFeeStructure = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "id is required" });

    const { error } = await supabase.from("fee_structures").delete().eq("id", id);
    if (error) return res.status(500).json({ message: "Failed to delete fee structure", error: error.message });

    res.json({ message: "Fee structure deleted", id });
  } catch (err) {
    console.error("deleteFeeStructure error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

