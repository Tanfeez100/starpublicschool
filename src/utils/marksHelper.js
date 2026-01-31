import { supabase } from "../services/supabase.js";

/**
 * Get class curriculum (all subjects for a class)
 */
export const getClassCurriculum = async (className) => {
  const { data, error } = await supabase
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
    .eq("class", className)
    .order("sequence", { ascending: true });

  if (error) throw new Error(`Failed to fetch curriculum: ${error.message}`);
  return data?.map((item) => item.subjects) || [];
};

/**
 * Calculate total marks for a class
 */
export const calculateClassTotalMarks = async (className) => {
  const curriculum = await getClassCurriculum(className);
  return curriculum.reduce((sum, subject) => {
    return sum + subject.max_external_marks + subject.max_internal_marks;
  }, 0);
};

/**
 * Calculate result summary from marks array
 */
export const calculateResultSummary = (marksData, curriculum) => {
  let totalMax = 0;
  let totalObtained = 0;

  curriculum.forEach((subject) => {
    totalMax += subject.max_external_marks + subject.max_internal_marks;
  });

  marksData?.forEach((mark) => {
    totalObtained += (mark.external_marks || 0) + (mark.internal_marks || 0);
  });

  const percentage = totalMax > 0 ? Number(((totalObtained / totalMax) * 100).toFixed(2)) : 0;

  let division = "Fail";
  if (percentage >= 60) division = "First";
  else if (percentage >= 45) division = "Second";
  else if (percentage >= 33) division = "Third";

  return {
    total_marks: totalMax,
    total_obtained: totalObtained,
    percentage,
    division,
    status: totalObtained > 0 ? "Published" : "Pending",
  };
};

/**
 * Format marks for response
 */
export const formatMarksResponse = (marksData, curriculum) => {
  const marksMap = {};
  marksData?.forEach((m) => {
    marksMap[m.subject_id] = {
      external: m.external_marks,
      internal: m.internal_marks,
      total: (m.external_marks || 0) + (m.internal_marks || 0),
    };
  });

  return curriculum.map((subject) => {
    const obtained = marksMap[subject.id] || {
      external: null,
      internal: null,
      total: 0,
    };
    const maxMarks = subject.max_external_marks + subject.max_internal_marks;

    return {
      subject: subject.name,
      code: subject.code,
      max_marks: maxMarks,
      max_external: subject.max_external_marks,
      max_internal: subject.max_internal_marks,
      external_marks: obtained.external !== null && obtained.external !== undefined ? obtained.external : "AB",
      internal_marks: obtained.internal !== null && obtained.internal !== undefined ? obtained.internal : "AB",
      total_obtained: obtained.total > 0 ? obtained.total : "AB",
    };
  });
};

/**
 * Validate marks against subject constraints
 */
export const validateMarks = (externalMarks, internalMarks, subject) => {
  const errors = [];

  if (externalMarks !== null && externalMarks !== undefined) {
    if (externalMarks < 0 || externalMarks > subject.max_external_marks) {
      errors.push(
        `External marks out of range (0-${subject.max_external_marks})`
      );
    }
  }

  if (internalMarks !== null && internalMarks !== undefined) {
    if (internalMarks < 0 || internalMarks > subject.max_internal_marks) {
      errors.push(
        `Internal marks out of range (0-${subject.max_internal_marks})`
      );
    }
  }

  return errors;
};

/**
 * Get all published results for a class and terminal
 */
export const getClassResults = async (className, terminal) => {
  const { data, error } = await supabase
    .from("result_summary")
    .select(`
      *,
      students!inner(
        id,
        name,
        roll_no,
        class,
        father_name
      )
    `)
    .eq("students.class", className)
    .eq("terminal", terminal)
    .order("students.roll_no", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch class results: ${error.message}`);
  }

  return data;
};

/**
 * Export results as CSV (for download)
 */
export const formatResultsCSV = (results, curriculum) => {
  if (!results?.length) return "";

  const headers = ["Roll No", "Student Name", "Father Name"];
  curriculum.forEach((subject) => {
    headers.push(subject.code);
  });
  headers.push(...["Total", "Percentage", "Division"]);

  const rows = results.map((result) => {
    const row = [
      result.students.roll_no,
      result.students.name,
      result.students.father_name,
    ];

    curriculum.forEach((subject) => {
      row.push(result[subject.id] || "AB"); // Replace with actual marks if stored
    });

    row.push(
      result.total_obtained,
      result.percentage,
      result.division
    );

    return row.map((val) => `"${val}"`).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
};

