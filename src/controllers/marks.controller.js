import { supabase } from "../services/supabase.js";

/**
 * Get all subjects for a class
 */
export const getClassSubjects = async (req, res) => {
  try {
    const { class: cls } = req.params;

    if (!cls) {
      return res.status(400).json({ message: "Class is required" });
    }

    const { data, error } = await supabase
      .from("class_subjects")
      .select(`
        id,
        sequence,
        subjects (
          id,
          name,
          code,
          max_external_marks,
          max_internal_marks
        )
      `)
      .eq("class", cls)
      .order("sequence", { ascending: true });

    if (error) {
      return res.status(500).json({ message: error.message });
    }

    res.json({
      class: cls,
      subjects: data?.map((item) => item.subjects) || [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get result for a student (specific terminal)
 * Query: ?class=UKG&roll=5&terminal=First
 */
export const getResultByClassRoll = async (req, res) => {
  try {
    const { class: cls, roll, terminal, section } = req.query;

    if (!cls || !roll || !terminal) {
      return res.status(400).json({
        message: "class, roll, and terminal are required",
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

    // 2️⃣ Get class subjects (with section filter if provided)
    // Try to get subjects filtered by section first, then fallback to all subjects for the class
    let classSubjects = null;
    let csError = null;

    // First attempt: Try with section filter if section is provided
    if (section) {
      const { data: sectionData, error: sectionError } = await supabase
        .from("class_subjects")
        .select(`
          subject_id,
          section,
          sequence,
          subjects (
            id,
            code,
            name
          )
        `)
        .eq("class", cls)
        .eq("section", section)
        .order("sequence", { ascending: true });

      if (!sectionError && sectionData && sectionData.length > 0) {
        classSubjects = sectionData;
      } else if (sectionError && sectionError.message && sectionError.message.includes("section")) {
        // Section column doesn't exist, fall through to get all subjects
        console.log("Section column not found, fetching all subjects for class");
      } else {
        // Section filter returned no results, try without section filter
        console.log(`No subjects found for section "${section}", trying all subjects for class`);
      }
    }

    // Fallback: Get all subjects for the class (if section filter didn't work or wasn't provided)
    if (!classSubjects) {
      const { data: allData, error: allError } = await supabase
        .from("class_subjects")
        .select(`
          subject_id,
          sequence,
          subjects (
            id,
            code,
            name
          )
        `)
        .eq("class", cls)
        .order("sequence", { ascending: true });

      classSubjects = allData;
      csError = allError;
    }

    if (csError) {
      console.error("Error fetching class subjects:", csError);
      return res.status(500).json({ 
        message: "Failed to fetch subjects for this class",
        error: csError.message 
      });
    }

    if (!classSubjects || classSubjects.length === 0) {
      return res.status(404).json({ 
        message: `No subjects found for class "${cls}"${section ? ` section "${section}"` : ""}`,
        note: section ? "Make sure subjects are added to this section using POST /api/subjects/add" : "Make sure subjects are added to this class using POST /api/subjects/add"
      });
    }

    // 3️⃣ Get marks for student (all subjects + terminal)
    const subjectIds = classSubjects.map((cs) => cs.subject_id || cs.subjects?.id).filter(Boolean);
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
    // Use default max marks (100 per subject: 80 external + 20 internal)
    // Drawing subject typically has 50, but for now using 100 for all
    const DEFAULT_MAX_MARKS = 100;
    let totalMaxMarks = 0;
    let totalObtained = 0;
    const marksDetails = [];

    classSubjects.forEach((cs) => {
      const subject = cs.subjects;
      if (!subject || !subject.id) return; // Skip if subject data is missing
      
      const maxMarks = DEFAULT_MAX_MARKS; // Use default max marks
      const subjectId = cs.subject_id || subject.id;
      const obtained = marksMap[subjectId] || {
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
        external_marks: obtained.external || "AB",
        internal_marks: obtained.internal || "AB",
        total_obtained: obtained.total || "AB",
      });
    });

    const percentage = totalMaxMarks > 0 ? ((totalObtained / totalMaxMarks) * 100).toFixed(2) : "0.00";
    const division =
      percentage >= 60
        ? "First"
        : percentage >= 45
        ? "Second"
        : percentage >= 33
        ? "Third"
        : "Fail";

    // 6️⃣ Check if result is published and use published data if available
    const { data: publishedSummary } = await supabase
      .from("result_summary")
      .select("status, total_marks, total_obtained, percentage, division")
      .eq("student_id", student.id)
      .eq("terminal", terminal)
      .maybeSingle();

    // Use published summary data if available, otherwise use calculated values
    let finalTotalMaxMarks = totalMaxMarks;
    let finalTotalObtained = totalObtained;
    let finalPercentage = percentage;
    let finalDivision = division;
    const status = publishedSummary?.status || (totalObtained > 0 ? "Pending" : "Pending");

    if (publishedSummary && publishedSummary.status === "Published") {
      // Use published values if result is published
      finalTotalMaxMarks = publishedSummary.total_marks || totalMaxMarks;
      finalTotalObtained = publishedSummary.total_obtained || totalObtained;
      finalPercentage = publishedSummary.percentage || percentage;
      finalDivision = publishedSummary.division || division;
    }
    
    // Ensure total_obtained is a number, not rounded incorrectly
    const totalObtainedRounded = finalTotalObtained > 0 ? Math.round(finalTotalObtained * 100) / 100 : 0;

    // 7️⃣ Response
    res.json({
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
        total_max_marks: finalTotalMaxMarks,
        total_obtained: totalObtainedRounded,
        percentage: finalPercentage,
        division: finalDivision,
        status,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Submit marks for a student
 * POST /api/marks/submit
 * Body: { class, section, terminal, roll_no, marks: [{ subject_name/code, external_marks, internal_marks }] }
 */
export const submitMarks = async (req, res) => {
  try {
    const { class: className, section, terminal, roll_no, marks } = req.body;

    // Validation
    if (!className || !terminal || !roll_no || !marks || !Array.isArray(marks)) {
      return res.status(400).json({
        message: "class, terminal, roll_no, and marks (array) are required",
      });
    }

    // Find student by class, section, and roll_no
    let studentQuery = supabase
      .from("students")
      .select("id, name, class, section, roll_no")
      .eq("class", className)
      .eq("roll_no", Number(roll_no));

    if (section) {
      studentQuery = studentQuery.eq("section", section);
    }

    const { data: student, error: studentError } = await studentQuery.single();

    if (studentError || !student) {
      return res.status(404).json({ 
        message: "Student not found. Please check class, section, and roll number." 
      });
    }

    // Get class subjects to validate subject names/codes
    // Filter by section if provided (subjects are section-specific)
    let classSubjectsQuery = supabase
      .from("class_subjects")
      .select(`
        subject_id,
        section,
        subjects (
          id,
          name,
          code
        )
      `)
      .eq("class", className);

    // If section is provided, filter by section
    if (section) {
      classSubjectsQuery = classSubjectsQuery.eq("section", section);
    }

    const { data: classSubjects, error: csError } = await classSubjectsQuery;

    if (csError || !classSubjects?.length) {
      return res.status(404).json({ 
        message: `No subjects found for class "${className}"${section ? ` section "${section}"` : ""}` 
      });
    }

    // Create subject map
    const subjectMap = {};
    classSubjects.forEach((cs) => {
      const subject = cs.subjects;
      subjectMap[subject.name.toLowerCase()] = subject.id;
      subjectMap[subject.code.toLowerCase()] = subject.id;
    });

    // Check existing marks for this student and terminal
    const { data: existingMarks, error: existingMarksError } = await supabase
      .from("marks")
      .select("id, subject_id, external_marks, internal_marks")
      .eq("student_id", student.id)
      .eq("terminal", terminal);

    const existingMarksMap = {};
    if (existingMarks && !existingMarksError) {
      existingMarks.forEach((m) => {
        existingMarksMap[m.subject_id] = m;
      });
    }

    // Prepare marks records (only for new marks, skip if already exists)
    const markRecords = [];
    const errors = [];
    const skipped = [];
    const duplicateCheckSet = new Set(); // Track subject_ids to prevent duplicates in the same request

    for (const mark of marks) {
      const { subject_name, subject_code, external_marks, internal_marks } = mark;

      if (!subject_name && !subject_code) {
        errors.push("Subject name or code is required for each mark");
        continue;
      }

      // Try to find subject by name first, then by code
      let subject_id = null;
      if (subject_name) {
        subject_id = subjectMap[subject_name.toLowerCase()];
      }
      if (!subject_id && subject_code) {
        subject_id = subjectMap[subject_code.toLowerCase()];
      }

      if (!subject_id) {
        errors.push(`Subject "${subject_name || subject_code}" not found for this class`);
        continue;
      }

      // Check if marks already exist for this subject (from database)
      const existingMark = existingMarksMap[subject_id];
      
      // Check if this subject_id is already in the current request (duplicate in same request)
      if (duplicateCheckSet.has(subject_id)) {
        skipped.push({
          subject: subject_name || subject_code,
          message: "Duplicate subject in request. Only the first entry will be processed.",
        });
        continue;
      }

      if (existingMark) {
        // Skip - marks already exist in database, don't update via submit API
        skipped.push({
          subject: subject_name || subject_code,
          message: "Marks already exist for this subject. Use PUT /api/marks/edit to update existing marks.",
        });
      } else {
        // Insert new marks only
        markRecords.push({
          student_id: student.id,
          subject_id: subject_id,
          terminal,
          external_marks: external_marks !== null && external_marks !== undefined ? Number(external_marks) : null,
          internal_marks: internal_marks !== null && internal_marks !== undefined ? Number(internal_marks) : null,
          status: "SUBMITTED",
          _subject_name: subject_name || subject_code, // Track for error messages
        });
        duplicateCheckSet.add(subject_id); // Track to prevent duplicates in same request
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        message: "Validation errors",
        errors,
      });
    }

    // Insert new marks (if any)
    if (markRecords.length === 0) {
      return res.status(400).json({
        message: "No new marks to submit. All marks already exist for this student.",
        skipped: skipped,
        note: "Use PUT /api/marks/edit to update existing marks.",
      });
    }

    // Insert new marks (if any) - handle duplicate key errors gracefully
    if (markRecords.length > 0) {
      // Create clean records for insertion (remove tracking fields)
      const cleanMarkRecords = markRecords.map(({ _subject_name, ...record }) => record);
      
      const { error: insertError } = await supabase
        .from("marks")
        .insert(cleanMarkRecords);

      if (insertError) {
        console.error("Insert marks error:", insertError);
        
        // Check if it's a duplicate key constraint error
        if (insertError.message && insertError.message.includes("duplicate key") && insertError.message.includes("marks_student_id_subject_id_terminal_key")) {
          // This means marks were added between our check and insert (race condition)
          // Re-check which marks actually got inserted and which were duplicates
          const { data: recheckMarks } = await supabase
            .from("marks")
            .select("subject_id")
            .eq("student_id", student.id)
            .eq("terminal", terminal)
            .in("subject_id", markRecords.map(m => m.subject_id));

          const insertedSubjectIds = new Set(recheckMarks?.map(m => m.subject_id) || []);
          
          // Find which subjects were actually duplicates
          const duplicateSubjects = [];
          markRecords.forEach((record) => {
            if (insertedSubjectIds.has(record.subject_id)) {
              // This one was already in DB, it's a duplicate
              duplicateSubjects.push({
                subject: record._subject_name,
                message: "Marks already exist for this subject. Use PUT /api/marks/edit to update existing marks.",
              });
            }
          });
          

          return res.status(400).json({
            message: "Some marks already exist in the database",
            error: "Duplicate key constraint violation",
            duplicate_subjects: duplicateSubjects,
            note: "Use PUT /api/marks/edit to update existing marks.",
          });
        }
        
        return res.status(500).json({ 
          message: "Failed to save marks",
          error: insertError.message 
        });
      }
    }

    res.json({
      success: true,
      message: `Marks submitted successfully. ${markRecords.length} new mark(s) added.`,
      student: {
        id: student.id,
        name: student.name,
        class: student.class,
        section: student.section,
        roll_no: student.roll_no,
      },
      terminal,
      marks_inserted: markRecords.length,
      skipped: skipped.length > 0 ? skipped : undefined,
      note: skipped.length > 0 ? "Some marks were skipped because they already exist. Use PUT /api/marks/edit to update existing marks." : undefined,
    });
  } catch (err) {
    console.error("Submit marks error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

/**
 * Edit marks for a student (update existing marks only)
 * PUT /api/marks/edit
 * Body: { class, section, terminal, roll_no, marks: [{ subject_name/code, external_marks, internal_marks }] }
 */
export const editMarks = async (req, res) => {
  try {
    const { class: className, section, terminal, roll_no, marks } = req.body;

    // Validation
    if (!className || !terminal || !roll_no || !marks || !Array.isArray(marks)) {
      return res.status(400).json({
        message: "class, terminal, roll_no, and marks (array) are required",
      });
    }

    // Find student by class, section, and roll_no
    let studentQuery = supabase
      .from("students")
      .select("id, name, class, section, roll_no")
      .eq("class", className)
      .eq("roll_no", Number(roll_no));

    if (section) {
      studentQuery = studentQuery.eq("section", section);
    }

    const { data: student, error: studentError } = await studentQuery.single();

    if (studentError || !student) {
      return res.status(404).json({ 
        message: "Student not found. Please check class, section, and roll number." 
      });
    }

    // Get class subjects to validate subject names/codes
    // Filter by section if provided (subjects are section-specific)
    let classSubjectsQuery = supabase
      .from("class_subjects")
      .select(`
        subject_id,
        section,
        subjects (
          id,
          name,
          code
        )
      `)
      .eq("class", className);

    // If section is provided, filter by section
    if (section) {
      classSubjectsQuery = classSubjectsQuery.eq("section", section);
    }

    const { data: classSubjects, error: csError } = await classSubjectsQuery;

    if (csError || !classSubjects?.length) {
      return res.status(404).json({ 
        message: `No subjects found for class "${className}"${section ? ` section "${section}"` : ""}` 
      });
    }

    // Create subject map
    const subjectMap = {};
    classSubjects.forEach((cs) => {
      const subject = cs.subjects;
      subjectMap[subject.name.toLowerCase()] = subject.id;
      subjectMap[subject.code.toLowerCase()] = subject.id;
    });

    // Get existing marks for this student and terminal
    const { data: existingMarks, error: existingMarksError } = await supabase
      .from("marks")
      .select("id, subject_id, external_marks, internal_marks")
      .eq("student_id", student.id)
      .eq("terminal", terminal);

    if (existingMarksError) {
      return res.status(500).json({
        message: "Failed to fetch existing marks",
        error: existingMarksError.message,
      });
    }

    const existingMarksMap = {};
    if (existingMarks) {
      existingMarks.forEach((m) => {
        existingMarksMap[m.subject_id] = m;
      });
    }

    // Update marks
    const errors = [];
    const updated = [];
    const notFound = [];

    for (const mark of marks) {
      const { subject_name, subject_code, external_marks, internal_marks } = mark;

      if (!subject_name && !subject_code) {
        errors.push("Subject name or code is required for each mark");
        continue;
      }

      const subjectKey = (subject_name || subject_code).toLowerCase();
      const subject_id = subjectMap[subjectKey];

      if (!subject_id) {
        errors.push(`Subject "${subject_name || subject_code}" not found for this class`);
        continue;
      }

      // Check if marks exist for this subject
      const existingMark = existingMarksMap[subject_id];
      
      if (!existingMark) {
        notFound.push({
          subject: subject_name || subject_code,
          message: "Marks not found for this subject. Use POST /api/marks/submit to add new marks.",
        });
        continue;
      }

      // Update existing marks
      const { data: updatedMark, error: updateError } = await supabase
        .from("marks")
        .update({
          external_marks: external_marks !== null && external_marks !== undefined ? Number(external_marks) : null,
          internal_marks: internal_marks !== null && internal_marks !== undefined ? Number(internal_marks) : null,
          status: "SUBMITTED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingMark.id)
        .select()
        .single();

      if (updateError) {
        errors.push(`Failed to update marks for "${subject_name || subject_code}": ${updateError.message}`);
      } else {
        updated.push({
          subject: subject_name || subject_code,
          subject_id: subject_id,
          external_marks: updatedMark.external_marks,
          internal_marks: updatedMark.internal_marks,
        });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        message: "Validation errors",
        errors,
        updated: updated.length,
        not_found: notFound,
      });
    }

    if (updated.length === 0 && notFound.length > 0) {
      return res.status(404).json({
        message: "No marks found to update",
        not_found: notFound,
        note: "Use POST /api/marks/submit to add new marks.",
      });
    }

    res.json({
      success: true,
      message: `Marks updated successfully for ${updated.length} subject(s)`,
      student: {
        id: student.id,
        name: student.name,
        class: student.class,
        section: student.section,
        roll_no: student.roll_no,
      },
      terminal,
      updated: updated,
      not_found: notFound.length > 0 ? notFound : undefined,
      total_updated: updated.length,
    });
  } catch (err) {
    console.error("Edit marks error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

/**
 * Publish result for entire class
 * POST /api/marks/publish
 * Body: { class, section (optional), terminal }
 */
export const publishResult = async (req, res) => {
  try {
    const { class: className, section, terminal } = req.body;

    if (!className || !terminal) {
      return res.status(400).json({
        message: "class and terminal are required",
      });
    }

    // Get all students in class (and section if provided)
    let studentsQuery = supabase
      .from("students")
      .select("id, name, class, section, roll_no")
      .eq("class", className);

    if (section) {
      studentsQuery = studentsQuery.eq("section", section);
    }

    const { data: students, error: studentsError } = await studentsQuery.order("roll_no");

    if (studentsError || !students?.length) {
      return res.status(404).json({ 
        message: `No students found for class "${className}"${section ? ` section "${section}"` : ""}` 
      });
    }

    // Get class subjects - same approach as submitMarks API
    // Get all subjects for the class, then filter by section if needed
    let classSubjectsQuery = supabase
      .from("class_subjects")
      .select(`
        subject_id,
        section,
        subjects (
          id,
          name,
          code
        )
      `)
      .eq("class", className);

    // Try with section filter first if section is provided
    if (section) {
      classSubjectsQuery = classSubjectsQuery.eq("section", section);
    }

    let { data: classSubjects, error: csError } = await classSubjectsQuery;

    // If section filter was used and got no results or error, try without section filter
    // This handles cases where section column doesn't exist or subjects were added without section
    if (section && (csError || !classSubjects || classSubjects.length === 0)) {
      console.log(`No subjects found with section "${section}", trying without section filter...`);
      const fallbackQuery = supabase
        .from("class_subjects")
        .select(`
          subject_id,
          section,
          subjects (
            id,
            name,
            code
          )
        `)
        .eq("class", className);
      
      const fallbackResult = await fallbackQuery;
      if (fallbackResult.data && fallbackResult.data.length > 0) {
        classSubjects = fallbackResult.data;
        csError = null;
        console.log(`Found ${classSubjects.length} subjects for class "${className}" (without section filter)`);
      }
    }

    if (csError) {
      console.error("Error fetching class subjects:", csError);
      // If error is about section column, provide helpful message
      if (csError.message && csError.message.includes("section")) {
        return res.status(500).json({ 
          message: "Database schema issue: section column may not exist in class_subjects table",
          error: csError.message,
          note: "Please run migration 004_add_section_to_class_subjects.sql or add subjects without section filter"
        });
      }
      return res.status(500).json({ 
        message: "Failed to fetch subjects for this class",
        error: csError.message 
      });
    }

    if (!classSubjects || classSubjects.length === 0) {
      return res.status(404).json({ 
        message: `No subjects found for class "${className}"${section ? ` section "${section}"` : ""}`,
        note: "Make sure subjects are added to this class using POST /api/subjects/add"
      });
    }

    // Calculate total max marks (default: 80 external + 20 internal = 100 per subject)
    // Drawing subject typically has 50 external + 0 internal = 50 total
    // For now, using default 100 per subject (can be customized later)
    const DEFAULT_MAX_MARKS = 100; // 80 external + 20 internal
    const totalMaxMarks = classSubjects.length * DEFAULT_MAX_MARKS;

    const publishedResults = [];
    const errors = [];

    // Process each student
    for (const student of students) {
      try {
        // Get marks for this student
        const subjectIds = classSubjects.map((cs) => cs.subject_id);
        const { data: marksData, error: marksError } = await supabase
          .from("marks")
          .select("*")
          .eq("student_id", student.id)
          .eq("terminal", terminal)
          .in("subject_id", subjectIds);

        if (marksError) {
          errors.push(`Error fetching marks for ${student.name}: ${marksError.message}`);
          continue;
        }

        // Calculate total obtained
        let totalObtained = 0;
        marksData?.forEach((m) => {
          totalObtained += (m.external_marks || 0) + (m.internal_marks || 0);
        });

        const percentage = totalMaxMarks > 0 
          ? ((totalObtained / totalMaxMarks) * 100).toFixed(2) 
          : "0.00";
        
        const division = 
          percentage >= 60 ? "First" 
          : percentage >= 45 ? "Second" 
          : percentage >= 33 ? "Third" 
          : "Fail";

        // Lock marks
        await supabase
          .from("marks")
          .update({ status: "LOCKED" })
          .eq("student_id", student.id)
          .eq("terminal", terminal);

        // Save summary
        await supabase
          .from("result_summary")
          .upsert(
            {
              student_id: student.id,
              terminal,
              total_marks: totalMaxMarks,
              total_obtained: totalObtained,
              percentage,
              division,
              status: "Published",
            },
            { onConflict: "student_id,terminal" }
          );

        publishedResults.push({
          student_id: student.id,
          name: student.name,
          roll_no: student.roll_no,
          total_obtained: totalObtained,
          percentage,
          division,
        });
      } catch (err) {
        errors.push(`Error processing ${student.name}: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: `Results published for ${publishedResults.length} student(s)`,
      class: className,
      section: section || "All",
      terminal,
      published: publishedResults.length,
      total_students: students.length,
      results: publishedResults,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Publish result error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

/**
 * Get all students' marks for a class and section
 * GET /api/marks?class=1&section=A&terminal=First
 */
export const getMarks = async (req, res) => {
  try {
    const { class: className, section, terminal } = req.query;

    if (!className || !terminal) {
      return res.status(400).json({
        message: "class and terminal are required",
      });
    }

    // Get all students in class (and section if provided)
    let studentsQuery = supabase
      .from("students")
      .select("id, name, class, section, roll_no")
      .eq("class", className);

    if (section) {
      studentsQuery = studentsQuery.eq("section", section);
    }

    const { data: students, error: studentsError } = await studentsQuery.order("roll_no");

    if (studentsError || !students?.length) {
      return res.status(404).json({ 
        message: `No students found for class "${className}"${section ? ` section "${section}"` : ""}` 
      });
    }

    // Get class subjects
    const { data: classSubjects, error: csError } = await supabase
      .from("class_subjects")
      .select(`
        subject_id,
        sequence,
        subjects (
          id,
          name,
          code
        )
      `)
      .eq("class", className)
      .order("sequence", { ascending: true });

    if (csError || !classSubjects?.length) {
      return res.status(404).json({ 
        message: "No subjects found for this class" 
      });
    }

    const subjectIds = classSubjects.map((cs) => cs.subject_id);
    const studentIds = students.map((s) => s.id);

    // Get all marks for these students
    const { data: marksData, error: marksError } = await supabase
      .from("marks")
      .select("*")
      .in("student_id", studentIds)
      .eq("terminal", terminal)
      .in("subject_id", subjectIds);

    if (marksError) {
      return res.status(500).json({ 
        message: "Failed to fetch marks",
        error: marksError.message 
      });
    }

    // Organize marks by student
    const marksByStudent = {};
    marksData?.forEach((m) => {
      if (!marksByStudent[m.student_id]) {
        marksByStudent[m.student_id] = {};
      }
      marksByStudent[m.student_id][m.subject_id] = {
        external_marks: m.external_marks,
        internal_marks: m.internal_marks,
        status: m.status,
      };
    });

    // Build response
    const studentsWithMarks = students.map((student) => {
      const studentMarks = marksByStudent[student.id] || {};
      const marks = classSubjects.map((cs) => {
        const subject = cs.subjects;
        const mark = studentMarks[subject.id];
        return {
          subject_id: subject.id,
          subject_name: subject.name,
          subject_code: subject.code,
          external_marks: mark?.external_marks || null,
          internal_marks: mark?.internal_marks || null,
          status: mark?.status || "PENDING",
        };
      });

      return {
        student_id: student.id,
        name: student.name,
        class: student.class,
        section: student.section,
        roll_no: student.roll_no,
        marks,
      };
    });

    res.json({
      success: true,
      class: className,
      section: section || "All",
      terminal,
      students: studentsWithMarks,
      count: studentsWithMarks.length,
    });
  } catch (err) {
    console.error("Get marks error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

