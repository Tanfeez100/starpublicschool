import { supabase } from "../services/supabase.js";

/**
 * Create a new fee structure entry
 * POST /api/fee-structure
 * Body: { class, section, fee_name, fee_amount, is_optional }
 */
export const createFeeStructure = async (req, res) => {
  try {
    const { class: className, tuition_fee, exam_fee, annual_fee, computer_fee } = req.body;

    // Validation
    if (!className || tuition_fee === undefined || exam_fee === undefined || annual_fee === undefined || computer_fee === undefined) {
      return res.status(400).json({
        message: "class, tuition_fee, exam_fee, annual_fee, and computer_fee are required",
      });
    }

    // All fees must be non-negative numbers
    const fees = [tuition_fee, exam_fee, annual_fee, computer_fee];
    if (fees.some(f => typeof f !== "number" || f < 0)) {
      return res.status(400).json({
        message: "All fee fields must be non-negative numbers",
      });
    }

    // Create fee structure
    const { data, error } = await supabase
      .from("fee_structure")
      .insert([
        {
          class: className,
          tuition_fee: parseFloat(tuition_fee),
          exam_fee: parseFloat(exam_fee),
          annual_fee: parseFloat(annual_fee),
          computer_fee: parseFloat(computer_fee),
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
    const { class: className } = req.query;

    let query = supabase.from("fee_structure").select("*");

    // Filter by class if provided
    if (className) {
      query = query.eq("class", className);
    }

    // Order by class
    query = query.order("class", { ascending: true });

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
    const { class: className, tuition_fee, exam_fee, annual_fee, computer_fee } = req.body;

    if (!id) {
      return res.status(400).json({
        message: "Fee structure ID is required",
      });
    }

    // Build update object
    const updateData = {};
    if (className !== undefined) updateData.class = className;
    if (tuition_fee !== undefined) {
      if (typeof tuition_fee !== "number" || tuition_fee < 0) {
        return res.status(400).json({ message: "tuition_fee must be a non-negative number" });
      }
      updateData.tuition_fee = parseFloat(tuition_fee);
    }
    if (exam_fee !== undefined) {
      if (typeof exam_fee !== "number" || exam_fee < 0) {
        return res.status(400).json({ message: "exam_fee must be a non-negative number" });
      }
      updateData.exam_fee = parseFloat(exam_fee);
    }
    if (annual_fee !== undefined) {
      if (typeof annual_fee !== "number" || annual_fee < 0) {
        return res.status(400).json({ message: "annual_fee must be a non-negative number" });
      }
      updateData.annual_fee = parseFloat(annual_fee);
    }
    if (computer_fee !== undefined) {
      if (typeof computer_fee !== "number" || computer_fee < 0) {
        return res.status(400).json({ message: "computer_fee must be a non-negative number" });
      }
      updateData.computer_fee = parseFloat(computer_fee);
    }
    updateData.updated_at = new Date().toISOString();

    if (Object.keys(updateData).length === 1) {
      // Only updated_at was set
      return res.status(400).json({
        message: "No fields to update",
      });
    }

    // Update fee structure
    const { data, error } = await supabase
      .from("fee_structure")
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
        .from("fee_structure")
        .select("id")
        .eq("id", id)
        .single();

    if (fetchError || !existing) {
      return res.status(404).json({
        message: "Fee structure not found",
      });
    }

    // Delete fee structure
      const { error } = await supabase.from("fee_structure").delete().eq("id", id);

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

