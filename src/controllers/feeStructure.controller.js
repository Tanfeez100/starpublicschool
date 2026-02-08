import { supabase } from "../services/supabase.js";

/**
 * Create a new fee structure entry
 * POST /api/fee-structure
 * Body: { class, section?, fee_name, fee_amount, is_optional? }
 * OR
 * Body: { class, section?, tuition_fee, exam_fee, annual_fee, computer_fee }
 */
export const createFeeStructure = async (req, res) => {
  try {
    const { 
      class: className, 
      section, 
      fee_name, 
      fee_amount, 
      is_optional,
      tuition_fee,
      exam_fee,
      annual_fee,
      computer_fee
    } = req.body;

    // Check if using old format (tuition_fee, exam_fee, etc.)
    if (tuition_fee !== undefined || exam_fee !== undefined || annual_fee !== undefined || computer_fee !== undefined) {
      // Old format - create multiple entries
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

      // Create single entry in fee_structure table (old format)
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
    } else {
      // New format - single entry
      if (!className || !fee_name || fee_amount === undefined) {
        return res.status(400).json({
          message: "class, fee_name, and fee_amount are required",
        });
      }

      // fee_amount must be a non-negative number
      if (typeof fee_amount !== "number" || fee_amount < 0) {
        return res.status(400).json({
          message: "fee_amount must be a non-negative number",
        });
      }

      // New format - for old table structure, we need to map fee_name to appropriate column
      // Since old table has separate columns, we'll map based on fee_name
      let insertData = { class: className };
      
      if (fee_name === "Tuition Fee" || fee_name === "tuition_fee") {
        insertData.tuition_fee = parseFloat(fee_amount);
        insertData.exam_fee = 0;
        insertData.annual_fee = 0;
        insertData.computer_fee = 0;
      } else if (fee_name === "Exam Fee" || fee_name === "exam_fee") {
        insertData.tuition_fee = 0;
        insertData.exam_fee = parseFloat(fee_amount);
        insertData.annual_fee = 0;
        insertData.computer_fee = 0;
      } else if (fee_name === "Annual Fee" || fee_name === "annual_fee") {
        insertData.tuition_fee = 0;
        insertData.exam_fee = 0;
        insertData.annual_fee = parseFloat(fee_amount);
        insertData.computer_fee = 0;
      } else if (fee_name === "Computer Fee" || fee_name === "computer_fee") {
        insertData.tuition_fee = 0;
        insertData.exam_fee = 0;
        insertData.annual_fee = 0;
        insertData.computer_fee = parseFloat(fee_amount);
      } else {
        return res.status(400).json({
          message: "fee_name must be one of: Tuition Fee, Exam Fee, Annual Fee, Computer Fee",
        });
      }

      const { data, error } = await supabase
        .from("fee_structure")
        .insert([insertData])
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
    }
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

    let query = supabase.from("fee_structure").select("*");

    // Filter by class if provided
    if (className) {
      query = query.eq("class", className);
    }

    // Note: Old table structure doesn't have section column
    // If section filter is needed, it would require table migration

    // Order by class, section, and fee_name
    query = query.order("class", { ascending: true })
                  .order("section", { ascending: true })
                  .order("fee_name", { ascending: true });

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
 * Body: { class?, tuition_fee?, exam_fee?, annual_fee?, computer_fee? }
 * OR
 * Body: { class?, section?, fee_name?, fee_amount?, is_optional? }
 */
export const updateFeeStructure = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      class: className, 
      tuition_fee, 
      exam_fee, 
      annual_fee, 
      computer_fee,
      section, 
      fee_name, 
      fee_amount, 
      is_optional 
    } = req.body;

    if (!id) {
      return res.status(400).json({
        message: "Fee structure ID is required",
      });
    }

    // Build update object for old table structure
    const updateData = {};
    if (className !== undefined) updateData.class = className;
    
    // Handle old format (tuition_fee, exam_fee, etc.)
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

    // Handle new format (fee_name, fee_amount) - map to old structure
    if (fee_name !== undefined && fee_amount !== undefined) {
      if (typeof fee_amount !== "number" || fee_amount < 0) {
        return res.status(400).json({ message: "fee_amount must be a non-negative number" });
      }
      
      if (fee_name === "Tuition Fee" || fee_name === "tuition_fee") {
        updateData.tuition_fee = parseFloat(fee_amount);
      } else if (fee_name === "Exam Fee" || fee_name === "exam_fee") {
        updateData.exam_fee = parseFloat(fee_amount);
      } else if (fee_name === "Annual Fee" || fee_name === "annual_fee") {
        updateData.annual_fee = parseFloat(fee_amount);
      } else if (fee_name === "Computer Fee" || fee_name === "computer_fee") {
        updateData.computer_fee = parseFloat(fee_amount);
      } else {
        return res.status(400).json({
          message: "fee_name must be one of: Tuition Fee, Exam Fee, Annual Fee, Computer Fee",
        });
      }
    }

    if (Object.keys(updateData).length === 0) {
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

