import express from "express";
import { supabase } from "../services/supabase.js";
import { adminOrTeacher, adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

/* ===============================
   GET ALL STUDENTS DETAILS (ALL CLASSES)
   Admin & Teacher can access
   Returns: All student details including ID, Name, Father, Mother, Gender, Class, Section, Roll, Mobile, Address, Transport
   =============================== */
router.get("/all", adminOrTeacher, async (req, res) => {
  try {
    const { class: cls } = req.query;

    // Build query - include all student fields
    let query = supabase
      .from("students")
      .select("id, name, father_name, mother_name, gender, class, section, roll_no, mobile, address, uses_transport, transport_charge")
      .order("class", { ascending: true })
      .order("section", { ascending: true })
      .order("roll_no", { ascending: true });

    // Filter by class if provided
    if (cls) {
      query = query.eq("class", String(cls));
    }

    const { data: students, error } = await query;

    if (error) {
      return res.status(500).json({ 
        message: "Failed to fetch students",
        error: error.message 
      });
    }

    // Format response to match table structure with all details
    const formattedStudents = students.map((student) => ({
      ID: student.id || "",
      Name: student.name || "",
      Father: student.father_name || "",
      Mother: student.mother_name || "",
      Gender: student.gender || "",
      Class: student.class || "",
      Section: student.section || "",
      Roll: student.roll_no || "",
      Mobile: student.mobile || "",
      Address: student.address || "",
      Transport: student.uses_transport ? (student.transport_charge || "Yes") : "No",
    }));

    res.json({
      success: true,
      count: formattedStudents.length,
      students: formattedStudents,
    });
  } catch (err) {
    console.error("Get all students error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
});

/* ===============================
   GET STUDENTS LIST (FOR BULK BILL)
   Admin & Teacher can access
   =============================== */
router.get("/", adminOrTeacher, async (req, res) => {
  try {
    const { class: cls } = req.query;

    if (!cls) {
      return res.status(400).json({ message: "class is required" });
    }

    // 1️⃣ Students
    const { data: students, error } = await supabase
      .from("students")
      .select(
        "id, name, father_name, mobile, address, class, roll_no, section, uses_transport"
      )
      .eq("class", String(cls))
      .order("roll_no");

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    // 2️⃣ Attach previous_due
    const studentsWithDue = await Promise.all(
      students.map(async (s) => {
        const { data: dues } = await supabase
          .from("fees")
          .select("due_amount")
          .eq("student_id", s.id)
          .in("status", ["DUE", "PARTIAL"]);

        const previous_due = dues?.reduce(
          (sum, d) => sum + Number(d.due_amount || 0),
          0
        );

        return {
          ...s,
          previous_due,
        };
      })
    );

    res.json(studentsWithDue);
  } catch (err) {
    console.error("STUDENTS API ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

/* ===============================
   ADD NEW STUDENT (ADMIN ONLY)
   =============================== */
router.post("/add", adminOnly, async (req, res) => {
  try {
    const {
      name,
      father_name,
      mother_name,
      gender,
      class: cls,
      roll_no,
      section,
      mobile,
      address,
      uses_transport = false,
      transport_charge,
    } = req.body;

    if (!name || !cls || !roll_no) {
      return res.status(400).json({
        message: "name, class and roll_no are required",
      });
    }

    const { data, error } = await supabase
      .from("students")
      .insert([
        {
          name,
          father_name,
          mother_name,
          gender,
          class: cls,
          roll_no,
          section,
          mobile,
          address,
          uses_transport,
          transport_charge: uses_transport ? transport_charge : null,
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    res.status(201).json({
      success: true,
      student_id: data.id,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


/* ===============================
   UPDATE STUDENT (ADMIN ONLY)
   =============================== */
router.put("/edit/:id", adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      father_name, 
      mother_name,
      gender,
      mobile, 
      address, 
      class: cls, 
      roll_no, 
      section, 
      uses_transport,
      transport_charge
    } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Student id is required" });
    }

    // Check if student exists
    const { data: existingStudent, error: checkError } = await supabase
      .from("students")
      .select("id")
      .eq("id", id)
      .single();

    if (checkError || !existingStudent) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Build update data
    const updateData = {};
    
    if (name !== undefined) updateData.name = name;
    if (father_name !== undefined) updateData.father_name = father_name;
    if (mother_name !== undefined) updateData.mother_name = mother_name;
    if (gender !== undefined) updateData.gender = gender;
    if (mobile !== undefined) updateData.mobile = mobile;
    if (address !== undefined) updateData.address = address;
    if (cls !== undefined) updateData.class = cls;
    if (roll_no !== undefined) updateData.roll_no = roll_no;
    if (section !== undefined) updateData.section = section;
    
    if (typeof uses_transport !== "undefined") {
      updateData.uses_transport = Boolean(uses_transport);
      // If transport is disabled, set transport_charge to null
      if (!uses_transport) {
        updateData.transport_charge = null;
      } else if (transport_charge !== undefined) {
        updateData.transport_charge = transport_charge;
      }
    } else if (transport_charge !== undefined && uses_transport !== false) {
      updateData.transport_charge = transport_charge;
    }

    // Update student
    const { data: updatedStudent, error } = await supabase
      .from("students")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ 
        message: "Failed to update student",
        error: error.message 
      });
    }

    res.json({ 
      success: true, 
      message: "Student updated successfully",
      student: updatedStudent
    });
  } catch (err) {
    console.error("Update student error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
});

/* ===============================
   DELETE STUDENT (ADMIN ONLY)
   =============================== */
router.delete("/:id", adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Student id is required" });
    }

    // Check if student exists
    const { data: existingStudent, error: checkError } = await supabase
      .from("students")
      .select("id, name, class, roll_no")
      .eq("id", id)
      .single();

    if (checkError || !existingStudent) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Delete student (cascade will handle related records like fees, marks)
    const { error: deleteError } = await supabase
      .from("students")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return res.status(500).json({ 
        message: "Failed to delete student",
        error: deleteError.message 
      });
    }

    res.json({ 
      success: true, 
      message: "Student deleted successfully",
      deleted_student: {
        id: existingStudent.id,
        name: existingStudent.name,
        class: existingStudent.class,
        roll_no: existingStudent.roll_no,
      }
    });
  } catch (err) {
    console.error("Delete student error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
});

export default router;