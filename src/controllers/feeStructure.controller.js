import { supabase } from "../services/supabase.js";

/**
 * Create a new fee structure entry
 * POST /api/fee-structure
 * Body: { class, section, fee_name, fee_amount, is_optional }
 */
export const createFeeStructure = async (req, res) => {
  try {
    const { class: className, section, fee_name, fee_amount, is_optional } = req.body;

    // Validation
    if (!className || !fee_name || fee_amount === undefined) {
      return res.status(400).json({
        message: "class, fee_name, and fee_amount are required",
      });
    }

    if (typeof fee_amount !== "number" || fee_amount < 0) {
      return res.status(400).json({
        message: "fee_amount must be a non-negative number",
      });
    }

    // Create fee structure
    const { data, error } = await supabase
      .from("fee_structures")
      .insert([
        {
          class: className,
          section: section || null,
          fee_name,
          fee_amount: parseFloat(fee_amount),
          is_optional: is_optional || false,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error creating fee structure:", error);
      return res.status(500).json({
        message: "Failed to create fee structure",
        error: error.message,
      });
    }

    res.status(201).json({
      message: "Fee structure created successfully",
      data,
    });
  } catch (error) {
    console.error("Error in createFeeStructure:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Get fee structures
 * GET /api/fee-structure?class=&section=
 */
export const getFeeStructures = async (req, res) => {
  try {
    const { class: className, section } = req.query;

    let query = supabase.from("fee_structures").select("*");

    // Filter by class if provided
    if (className) {
      query = query.eq("class", className);
    }

    // Filter by section if provided
    if (section) {
      query = query.eq("section", section);
    }

    // Order by class, section, and fee_name
    query = query.order("class", { ascending: true });
    query = query.order("section", { ascending: true });
    query = query.order("fee_name", { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching fee structures:", error);
      return res.status(500).json({
        message: "Failed to fetch fee structures",
        error: error.message,
      });
    }

    res.json({
      message: "Fee structures fetched successfully",
      count: data?.length || 0,
      data: data || [],
    });
  } catch (error) {
    console.error("Error in getFeeStructures:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Update fee structure
 * PUT /api/fee-structure/:id
 * Body: { class?, section?, fee_name?, fee_amount?, is_optional? }
 */
export const updateFeeStructure = async (req, res) => {
  try {
    const { id } = req.params;
    const { class: className, section, fee_name, fee_amount, is_optional } = req.body;

    if (!id) {
      return res.status(400).json({
        message: "Fee structure ID is required",
      });
    }

    // Build update object
    const updateData = {};
    if (className !== undefined) updateData.class = className;
    if (section !== undefined) updateData.section = section;
    if (fee_name !== undefined) updateData.fee_name = fee_name;
    if (fee_amount !== undefined) {
      if (typeof fee_amount !== "number" || fee_amount < 0) {
        return res.status(400).json({
          message: "fee_amount must be a non-negative number",
        });
      }
      updateData.fee_amount = parseFloat(fee_amount);
    }
    if (is_optional !== undefined) updateData.is_optional = is_optional;
    updateData.updated_at = new Date().toISOString();

    if (Object.keys(updateData).length === 1) {
      // Only updated_at was set
      return res.status(400).json({
        message: "No fields to update",
      });
    }

    // Update fee structure
    const { data, error } = await supabase
      .from("fee_structures")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating fee structure:", error);
      if (error.code === "PGRST116") {
        return res.status(404).json({
          message: "Fee structure not found",
        });
      }
      return res.status(500).json({
        message: "Failed to update fee structure",
        error: error.message,
      });
    }

    res.json({
      message: "Fee structure updated successfully",
      data,
    });
  } catch (error) {
    console.error("Error in updateFeeStructure:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Delete fee structure
 * DELETE /api/fee-structure/:id
 */
export const deleteFeeStructure = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: "Fee structure ID is required",
      });
    }

    // Check if fee structure exists
    const { data: existing, error: fetchError } = await supabase
      .from("fee_structures")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        message: "Fee structure not found",
      });
    }

    // Delete fee structure
    const { error } = await supabase.from("fee_structures").delete().eq("id", id);

    if (error) {
      console.error("Error deleting fee structure:", error);
      return res.status(500).json({
        message: "Failed to delete fee structure",
        error: error.message,
      });
    }

    res.json({
      message: "Fee structure deleted successfully",
      id,
    });
  } catch (error) {
    console.error("Error in deleteFeeStructure:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};

