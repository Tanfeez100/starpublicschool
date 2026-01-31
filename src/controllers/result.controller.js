import { supabase } from "../services/supabase.js";

/**
 * Get result for a student (specific terminal)
 * Query: ?class=1&roll=1&terminal=First&section=A (section is optional)
 * This endpoint is PUBLIC - no authentication required
 */
export const getResult = async (req, res) => {
  try {
    const { class: cls, roll, terminal, section } = req.query;

    // 🔒 STRICT VALIDATION
    if (!cls || !roll || !terminal) {
      return res.status(400).json({
        message: "Class, Roll and Terminal are required",
      });
    }

    // 1️⃣ Fetch student (with optional section filter)
    let studentQuery = supabase
      .from("students")
      .select("*")
      .eq("class", cls)
      .eq("roll_no", Number(roll));
    
    // Add section filter if provided
    if (section) {
      studentQuery = studentQuery.eq("section", section);
    }
    
    const { data: student, error: studentError } = await studentQuery.single();

    if (studentError || !student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // 2️⃣ Get class subjects
    const { data: classSubjects, error: csError } = await supabase
      .from("class_subjects")
      .select(`
        subjects (
          id,
          code,
          name,
          max_external_marks,
          max_internal_marks
        )
      `)
      .eq("class", cls)
      .order("sequence", { ascending: true });

    if (csError || !classSubjects?.length) {
      return res.status(404).json({ message: "No subjects found for class" });
    }

    // 3️⃣ Get marks for student (all subjects + terminal)
    const subjectIds = classSubjects.map((cs) => cs.subjects.id);
    const { data: marksData, error: marksError } = await supabase
      .from("marks")
      .select("*")
      .eq("student_id", student.id)
      .eq("terminal", terminal)
      .in("subject_id", subjectIds);

    if (marksError) {
      return res.status(500).json({ message: marksError.message });
    }

    // 4️⃣ Build response with marks
    const marksMap = {};
    marksData?.forEach((m) => {
      marksMap[m.subject_id] = {
        external: m.external_marks,
        internal: m.internal_marks,
        total: (m.external_marks || 0) + (m.internal_marks || 0),
      };
    });

    // 5️⃣ Calculate summary
    let totalMaxMarks = 0;
    let totalObtained = 0;
    const marksDetails = [];

    classSubjects.forEach((cs) => {
      const subject = cs.subjects;
      const maxMarks = (subject.max_external_marks || 0) + (subject.max_internal_marks || 0);
      const obtained = marksMap[subject.id] || {
        external: null,
        internal: null,
        total: 0,
      };

      totalMaxMarks += maxMarks;
      totalObtained += obtained.total || 0;

      marksDetails.push({
        subject: subject.name,
        code: subject.code,
        max_marks: maxMarks,
        external_marks: obtained.external !== null && obtained.external !== undefined ? obtained.external : "AB",
        internal_marks: obtained.internal !== null && obtained.internal !== undefined ? obtained.internal : "AB",
        total_obtained: obtained.total > 0 ? obtained.total : "AB",
      });
    });

    const percentage = totalMaxMarks > 0 ? ((totalObtained / totalMaxMarks) * 100).toFixed(2) : "0.00";
    const division =
      parseFloat(percentage) >= 60
        ? "First"
        : parseFloat(percentage) >= 45
        ? "Second"
        : parseFloat(percentage) >= 33
        ? "Third"
        : "Fail";

    // 6️⃣ Check if result is published
    const { data: publishedSummary } = await supabase
      .from("result_summary")
      .select("status")
      .eq("student_id", student.id)
      .eq("terminal", terminal)
      .maybeSingle();

    const status = publishedSummary?.status || (totalObtained > 0 ? "Pending" : "Pending");
    
    // Ensure total_obtained is a number
    const totalObtainedRounded = totalObtained > 0 ? Math.round(totalObtained * 100) / 100 : 0;

    // 7️⃣ Response
    return res.json({
      student: {
        id: student.id,
        name: student.name,
        father_name: student.father_name,
        class: student.class,
        roll_no: student.roll_no,
        section: student.section,
      },
      terminal,
      marks: marksDetails,
      summary: {
        total_max_marks: totalMaxMarks,
        total_obtained: totalObtainedRounded,
        percentage,
        division,
        status,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
