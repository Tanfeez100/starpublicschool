import { supabase } from "../services/supabase.js";

/**
 * Create a new subject (only name and code)
 */
export const createSubject = async (req, res) => {
  try {
    const { name, code } = req.body;

    // Validation
    if (!name || !code) {
      return res.status(400).json({ 
        message: "Subject name and code are required" 
      });
    }

    // Check if subject with same name or code already exists (check separately for safety)
    const { data: existingByName } = await supabase
      .from("subjects")
      .select("id, name, code")
      .eq("name", name.trim())
      .maybeSingle();

    const { data: existingByCode } = await supabase
      .from("subjects")
      .select("id, name, code")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();

    if (existingByName) {
      return res.status(400).json({ 
        message: `Subject with name "${name}" already exists` 
      });
    }
    if (existingByCode) {
      return res.status(400).json({ 
        message: `Subject with code "${code}" already exists` 
      });
    }

    // Create subject (only name and code)
    const { data, error } = await supabase
      .from("subjects")
      .insert([
        {
          name: name.trim(),
          code: code.trim().toUpperCase(),
        },
      ])
      .select("id, name, code, created_at")
      .single();

    if (error) {
      console.error("Create subject error:", error);
      return res.status(500).json({ 
        message: "Failed to create subject",
        error: error.message 
      });
    }

    res.status(201).json({
      success: true,
      message: `Subject "${name}" created successfully`,
      subject: data,
    });
  } catch (err) {
    console.error("Create subject error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

/**
 * Get all available subjects (Master list)
 * Returns subjects grouped by class with counts
 * Structure: { classes: [{ class, sections: [{ section, subjects: [], count }], total_subjects }], summary }
 */
export const getAllSubjects = async (req, res) => {
  try {
    // 1️⃣ Get all master subjects
    const { data: allSubjects, error: subjectsError } = await supabase
      .from("subjects")
      .select("id, name, code, created_at")
      .order("name", { ascending: true });

    if (subjectsError) {
      console.error("Get all subjects error:", subjectsError);
      return res.status(500).json({ 
        message: "Failed to fetch subjects",
        error: subjectsError.message 
      });
    }

    // 2️⃣ Get all class-subject mappings with section
    const { data: classSubjects, error: classSubjectsError } = await supabase
      .from("class_subjects")
      .select(`
        id,
        class,
        section,
        sequence,
        created_at,
        subjects (
          id,
          name,
          code
        )
      `)
      .order("class", { ascending: true })
      .order("section", { ascending: true })
      .order("sequence", { ascending: true });

    if (classSubjectsError) {
      console.error("Get class subjects error:", classSubjectsError);
      return res.status(500).json({ 
        message: "Failed to fetch class subjects",
        error: classSubjectsError.message 
      });
    }

    // 3️⃣ Group by class and section
    const classSectionMap = {};
    
    classSubjects?.forEach((cs) => {
      const className = cs.class;
      const section = cs.section || "All"; // Default to "All" if section is null
      
      // Create class key
      if (!classSectionMap[className]) {
        classSectionMap[className] = {};
      }
      
      // Create section key within class
      if (!classSectionMap[className][section]) {
        classSectionMap[className][section] = {
          section: section,
          subjects: [],
          total_subjects: 0,
        };
      }

      if (cs.subjects) {
        classSectionMap[className][section].subjects.push({
          id: cs.id, // class_subjects id
          sequence: cs.sequence,
          subject_id: cs.subjects.id,
          subject_name: cs.subjects.name,
          subject_code: cs.subjects.code,
        });
        classSectionMap[className][section].total_subjects++;
      }
    });

    // 4️⃣ Get section information for each class from students table (for sections that might not have subjects yet)
    const { data: studentsData } = await supabase
      .from("students")
      .select("class, section")
      .not("section", "is", null);

    // Group sections by class
    const classSectionsMap = {};
    studentsData?.forEach((student) => {
      const className = student.class;
      const section = student.section;
      
      if (!classSectionsMap[className]) {
        classSectionsMap[className] = new Set();
      }
      if (section) {
        classSectionsMap[className].add(section);
      }
    });

    // 5️⃣ Convert to array and sort, group by class and section
    const classes = Object.keys(classSectionMap).map((className) => {
      const sectionsData = classSectionMap[className];
      const sections = Object.keys(sectionsData).sort();
      
      // Get all sections (from both class_subjects and students table)
      const allSections = new Set(sections);
      if (classSectionsMap[className]) {
        classSectionsMap[className].forEach(section => allSections.add(section));
      }
      
      const sortedSections = Array.from(allSections).sort();
      
      // Build sections array with their subjects
      const sectionsArray = sortedSections.map((section) => {
        const sectionData = sectionsData[section];
        if (sectionData) {
          return {
            section: section,
            subjects: sectionData.subjects.sort((a, b) => (a.sequence || 0) - (b.sequence || 0)),
            total_subjects: sectionData.total_subjects,
          };
        } else {
          // Section exists in students but no subjects assigned yet
          return {
            section: section,
            subjects: [],
            total_subjects: 0,
          };
        }
      });
      
      // Calculate total subjects across all sections for this class
      const totalSubjects = sectionsArray.reduce((sum, sec) => sum + sec.total_subjects, 0);
      
      return {
        class: className,
        sections: sectionsArray,
        total_subjects: totalSubjects,
        total_sections: sectionsArray.length,
      };
    }).sort((a, b) => {
      // Sort classes: numbers first, then alphabetic
      const aNum = parseInt(a.class);
      const bNum = parseInt(b.class);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      if (!isNaN(aNum)) return -1;
      if (!isNaN(bNum)) return 1;
      return a.class.localeCompare(b.class);
    });

    // 6️⃣ Calculate summary
    const totalClasses = classes.length;
    const totalSubjectMappings = classSubjects?.length || 0;
    const totalUniqueSubjects = allSubjects?.length || 0;

    // Count subjects per class
    const subjectsPerClass = classes.map((cls) => ({
      class: cls.class,
      subjects_count: cls.total_subjects,
      sections_count: cls.total_sections,
    }));

    res.json({
      success: true,
      summary: {
        total_classes: totalClasses,
        total_subject_mappings: totalSubjectMappings,
        total_unique_subjects: totalUniqueSubjects,
        subjects_per_class: subjectsPerClass,
      },
      classes: classes,
      all_subjects: allSubjects || [], // Master list of all subjects
    });
  } catch (err) {
    console.error("Get all subjects error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

/**
 * Get subjects for a specific class
 */
export const getClassSubjects = async (req, res) => {
  try {
    const { class: className } = req.params;
    const { section } = req.query; // Optional section filter

    if (!className) {
      return res.status(400).json({ 
        message: "Class is required" 
      });
    }

    let query = supabase
      .from("class_subjects")
      .select(`
        id,
        class,
        section,
        sequence,
        created_at,
        subjects (
          id,
          name,
          code
        )
      `)
      .eq("class", className);

    // Filter by section if provided - only show subjects for that section
    if (section) {
      query = query.eq("section", section);
    }

    const { data, error } = await query.order("sequence", { ascending: true });

    if (error) {
      console.error("Get class subjects error:", error);
      return res.status(500).json({ 
        message: "Failed to fetch class subjects",
        error: error.message 
      });
    }

    res.json({
      success: true,
      class: className,
      section: section || "All",
      subjects: data?.map((item) => ({
        id: item.id,
        section: item.section,
        sequence: item.sequence,
        subject: item.subjects,
      })) || [],
      count: data?.length || 0,
    });
  } catch (err) {
    console.error("Get class subjects error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

/**
 * Add subject to a class
 * Only accepts existing subjects from subjects table (created via POST /api/subjects)
 * Body: { class, subject_name OR subject_code, sequence }
 */
export const addSubjectToClass = async (req, res) => {
  try {
    const { class: classNameRaw, subject_name, subject_code, sequence } = req.body;
    const className = classNameRaw?.trim();

    // Validation
    if (!className) {
      return res.status(400).json({ 
        message: "Class is required" 
      });
    }

    // Either subject_name or subject_code must be provided
    if (!subject_name && !subject_code) {
      return res.status(400).json({ 
        message: "Either subject_name or subject_code is required" 
      });
    }

    // Find existing subject by name or code (subject must already exist in subjects table)
    let subjectQuery = supabase
      .from("subjects")
      .select("id, name, code");

    if (subject_name) {
      subjectQuery = subjectQuery.eq("name", subject_name.trim());
    } else if (subject_code) {
      subjectQuery = subjectQuery.eq("code", subject_code.trim().toUpperCase());
    }

    const { data: subject, error: subjectError } = await subjectQuery.maybeSingle();

    if (subjectError && subjectError.code !== "PGRST116") {
      console.error("Find subject error:", subjectError);
      return res.status(500).json({ 
        message: "Failed to find subject",
        error: subjectError.message 
      });
    }

    if (!subject) {
      const identifier = subject_name || subject_code;
      return res.status(404).json({ 
        message: `Subject not found. Please create the subject first using POST /api/subjects. Provided: "${identifier}"` 
      });
    }

    const subject_id = subject.id;

    // Check if subject already exists for this class
    const { data: existingRows, error: checkError } = await supabase
      .from("class_subjects")
      .select("id")
      .eq("class", className)
      .eq("subject_id", subject_id)
      .limit(1);

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Check existing error:", checkError);
      return res.status(500).json({ 
        message: "Failed to check existing subject",
        error: checkError.message 
      });
    }

    if (existingRows && existingRows.length > 0) {
      return res.status(400).json({ 
        message: `Subject "${subject.name}" is already assigned to class "${className}"` 
      });
    }

    // Get max sequence for this class
    let maxSequence = 0;
    if (sequence === undefined || sequence === null) {
      const { data: lastSubject } = await supabase
        .from("class_subjects")
        .select("sequence")
        .eq("class", className)
        .order("sequence", { ascending: false })
        .limit(1)
        .maybeSingle();

      maxSequence = (lastSubject?.sequence || 0) + 1;
    } else {
      maxSequence = Number(sequence);
    }

    // Insert subject to class
    const { data, error } = await supabase
      .from("class_subjects")
      .insert([
        {
          class: className,
          subject_id: subject_id,
          sequence: maxSequence,
        },
      ])
      .select(`
        id,
        class,
        sequence,
        subjects (
          id,
          name,
          code
        )
      `)
      .single();

    if (error) {
      console.error("Add subject to class error:", error);
      return res.status(500).json({ 
        message: "Failed to add subject to class",
        error: error.message
      });
    }

    // Success - existing subject added to class
    res.status(201).json({
      success: true,
      message: `Subject "${subject.name}" (${subject.code}) added to class "${className}" successfully`,
      data: {
        id: data.id,
        class: data.class,
        sequence: data.sequence,
        subject: data.subjects,
      },
    });
  } catch (err) {
    console.error("Add subject to class error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

/**
 * Remove subject from a class
 */
export const removeSubjectFromClass = async (req, res) => {
  try {
    const { id } = req.params; // class_subjects id
    const { class: className, section, subject_name, subject_code } = req.query;

    let deleteQuery;
    let subjectInfo = null;

    if (id) {
      // Delete by class_subjects id
      // Get subject info before deleting
      const { data: existing } = await supabase
        .from("class_subjects")
        .select(`
          class,
          subjects (name, code)
        `)
        .eq("id", id)
        .single();

      if (!existing) {
        return res.status(404).json({ 
          message: "Subject assignment not found" 
        });
      }

      subjectInfo = {
        class: existing.class,
        section: section || null, // Section is for reference only (stored in students table)
        subject: existing.subjects,
      };

      deleteQuery = supabase
        .from("class_subjects")
        .delete()
        .eq("id", id);
    } else if (className && section && (subject_name || subject_code)) {
      // Find subject by name or code first
      let subjectQuery = supabase
        .from("subjects")
        .select("id, name, code");

      if (subject_name) {
        subjectQuery = subjectQuery.eq("name", subject_name.trim());
      } else if (subject_code) {
        subjectQuery = subjectQuery.eq("code", subject_code.trim().toUpperCase());
      }

      const { data: subject, error: subjectError } = await subjectQuery.maybeSingle();

      if (subjectError && subjectError.code !== "PGRST116") {
        console.error("Find subject error:", subjectError);
        return res.status(500).json({ 
          message: "Failed to find subject",
          error: subjectError.message 
        });
      }

      if (!subject) {
        return res.status(404).json({ 
          message: `Subject not found. Provided: "${subject_name || subject_code}"` 
        });
      }

      // Get subject info before deleting
      const { data: existing } = await supabase
        .from("class_subjects")
        .select(`
          class,
          section,
          subjects (name, code)
        `)
        .eq("class", className)
        .eq("section", section)
        .eq("subject_id", subject.id)
        .maybeSingle();

      if (!existing) {
        return res.status(404).json({ 
          message: `Subject "${subject.name}" not found in class "${className}" section "${section}"` 
        });
      }

      subjectInfo = {
        class: existing.class,
        section: existing.section,
        subject: existing.subjects,
      };

      // Delete by class, section, and subject_id
      deleteQuery = supabase
        .from("class_subjects")
        .delete()
        .eq("class", className)
        .eq("section", section)
        .eq("subject_id", subject.id);
    } else {
      return res.status(400).json({ 
        message: "Either id (path param) or class + section + subject_name/subject_code (query params) are required" 
      });
    }

    // Delete the subject from class and section
    const { error } = await deleteQuery;

    if (error) {
      console.error("Remove subject from class error:", error);
      return res.status(500).json({ 
        message: "Failed to remove subject from class",
        error: error.message 
      });
    }

    if (!subjectInfo) {
      return res.status(404).json({ 
        message: "Subject assignment not found" 
      });
    }

    const sectionText = subjectInfo.section ? ` section "${subjectInfo.section}"` : "";
    res.json({
      success: true,
      message: `Subject "${subjectInfo.subject.name}" removed from class "${subjectInfo.class}"${sectionText} successfully`,
      removed: {
        class: subjectInfo.class,
        section: subjectInfo.section,
        subject: subjectInfo.subject,
      },
    });
  } catch (err) {
    console.error("Remove subject from class error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

/**
 * Update subject sequence in a class
 */
/**
 * Delete a subject from the master subjects table
 * Can delete by subject_id (path param) or subject_name/subject_code (query params)
 * This will cascade delete from class_subjects and marks tables due to foreign key constraints
 */
export const deleteSubject = async (req, res) => {
  try {
    const { id } = req.params; // subject_id from path
    const { subject_name, subject_code } = req.query; // from query params

    let subject_id;
    let subject = null;

    // Find subject by id, name, or code
    if (id) {
      // Delete by subject_id
      const { data: foundSubject, error: findError } = await supabase
        .from("subjects")
        .select("id, name, code")
        .eq("id", id)
        .single();

      if (findError || !foundSubject) {
        return res.status(404).json({ 
          message: `Subject not found with id: "${id}"` 
        });
      }

      subject_id = foundSubject.id;
      subject = foundSubject;
    } else if (subject_name || subject_code) {
      // Delete by subject_name or subject_code
      let query = supabase
        .from("subjects")
        .select("id, name, code");

      if (subject_name) {
        query = query.eq("name", subject_name.trim());
      } else if (subject_code) {
        query = query.eq("code", subject_code.trim().toUpperCase());
      }

      const { data: foundSubject, error: findError } = await query.maybeSingle();

      if (findError && findError.code !== "PGRST116") {
        console.error("Find subject error:", findError);
        return res.status(500).json({ 
          message: "Failed to find subject",
          error: findError.message 
        });
      }

      if (!foundSubject) {
        return res.status(404).json({ 
          message: `Subject not found. Provided: "${subject_name || subject_code}"` 
        });
      }

      subject_id = foundSubject.id;
      subject = foundSubject;
    } else {
      return res.status(400).json({ 
        message: "Either id (path param) or subject_name/subject_code (query params) are required" 
      });
    }

    // Check if subject is being used in any class
    const { data: classSubjects, error: checkError } = await supabase
      .from("class_subjects")
      .select("id, class, section")
      .eq("subject_id", subject_id);

    if (checkError && checkError.code !== "PGRST116") {
      console.warn("Check class_subjects error:", checkError);
    }

    const isUsedInClasses = classSubjects && classSubjects.length > 0;
    const classesCount = classSubjects?.length || 0;

    // Check if subject has any marks
    const { data: marksData, error: marksCheckError } = await supabase
      .from("marks")
      .select("id")
      .eq("subject_id", subject_id)
      .limit(1);

    if (marksCheckError && marksCheckError.code !== "PGRST116") {
      console.warn("Check marks error:", marksCheckError);
    }

    const hasMarks = marksData && marksData.length > 0;

    // Step 1: Delete from class_subjects first (to avoid foreign key constraint error)
    if (isUsedInClasses) {
      const { error: deleteClassSubjectsError } = await supabase
        .from("class_subjects")
        .delete()
        .eq("subject_id", subject_id);

      if (deleteClassSubjectsError) {
        console.error("Delete from class_subjects error:", deleteClassSubjectsError);
        return res.status(500).json({ 
          message: "Failed to delete subject from classes",
          error: deleteClassSubjectsError.message 
        });
      }
    }

    // Step 2: Delete from marks table (if any marks exist)
    if (hasMarks) {
      const { error: deleteMarksError } = await supabase
        .from("marks")
        .delete()
        .eq("subject_id", subject_id);

      if (deleteMarksError) {
        console.error("Delete from marks error:", deleteMarksError);
        return res.status(500).json({ 
          message: "Failed to delete subject marks",
          error: deleteMarksError.message 
        });
      }
    }

    // Step 3: Now delete from subjects table (no foreign key constraint issue)
    const { error: deleteError } = await supabase
      .from("subjects")
      .delete()
      .eq("id", subject_id);

    if (deleteError) {
      console.error("Delete subject error:", deleteError);
      return res.status(500).json({ 
        message: "Failed to delete subject",
        error: deleteError.message 
      });
    }

    // Build response message
    let deletedFrom = [];
    if (isUsedInClasses) deletedFrom.push(`${classesCount} class(es)`);
    if (hasMarks) deletedFrom.push("marks");

    res.json({
      success: true,
      message: `Subject "${subject.name}" (${subject.code}) deleted successfully from database`,
      deleted_subject: {
        id: subject.id,
        name: subject.name,
        code: subject.code,
      },
      deleted_from: deletedFrom.length > 0 
        ? `Also deleted from: ${deletedFrom.join(", ")}`
        : "Subject was not assigned to any class or had no marks.",
      details: {
        classes_removed: classesCount,
        marks_removed: hasMarks ? "Yes" : "No",
      },
    });
  } catch (err) {
    console.error("Delete subject error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

export const updateSubjectSequence = async (req, res) => {
  try {
    const { id } = req.params;
    const { sequence } = req.body;

    if (!id || sequence === undefined) {
      return res.status(400).json({ 
        message: "id and sequence are required" 
      });
    }

    const { data, error } = await supabase
      .from("class_subjects")
      .update({ sequence: Number(sequence) })
      .eq("id", id)
      .select(`
        id,
        class,
        sequence,
        subjects (
          id,
          name,
          code
        )
      `)
      .single();

    if (error) {
      console.error("Update sequence error:", error);
      return res.status(500).json({ 
        message: "Failed to update sequence",
        error: error.message 
      });
    }

    res.json({
      success: true,
      message: "Sequence updated successfully",
      data,
    });
  } catch (err) {
    console.error("Update sequence error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

/**
 * Add multiple subjects to a class at once
 * Body: { class, subjects: [{ subject_id }] }
 * Simplified - only accepts subject IDs array
 */
export const addMultipleSubjectsToClass = async (req, res) => {
  try {
    const { class: className, section, subjects } = req.body;

    if (!className || !subjects) {
      return res.status(400).json({ 
        message: "Class and subjects array are required" 
      });
    }
    // Section is optional - for reference only (stored in students table, not class_subjects)

    if (!Array.isArray(subjects) || subjects.length === 0) {
      return res.status(400).json({ 
        message: "Subjects must be a non-empty array" 
      });
    }

    // Extract subject IDs from array
    const subject_ids = subjects
      .map((s) => s.subject_id || s.id || s)
      .filter((id) => id);

    if (subject_ids.length === 0) {
      return res.status(400).json({ 
        message: "At least one valid subject_id is required" 
      });
    }

    // Verify all subjects exist
    const { data: foundSubjects, error: findError } = await supabase
      .from("subjects")
      .select("id, name, code")
      .in("id", subject_ids);

    if (findError) {
      console.error("Find subjects error:", findError);
      return res.status(500).json({ 
        message: "Failed to find subjects",
        error: findError.message 
      });
    }

    if (!foundSubjects || foundSubjects.length === 0) {
      return res.status(404).json({ 
        message: "No subjects found with the provided IDs" 
      });
    }

    if (foundSubjects.length !== subject_ids.length) {
      const foundIds = foundSubjects.map(s => s.id);
      const notFound = subject_ids.filter(id => !foundIds.includes(id));
      return res.status(404).json({ 
        message: `Some subjects not found: ${notFound.join(", ")}` 
      });
    }

    // Get existing subjects for this class and section
    const { data: existing } = await supabase
      .from("class_subjects")
      .select("subject_id")
      .eq("class", className)
      .eq("section", section);

    const existingIds = existing?.map((e) => e.subject_id) || [];
    const newSubjectIds = subject_ids.filter((id) => !existingIds.includes(id));

    if (newSubjectIds.length === 0) {
      return res.status(400).json({ 
        message: `All subjects are already assigned to class "${className}" section "${section}"` 
      });
    }

    // Get max sequence for this class and section
    const { data: lastSubject } = await supabase
      .from("class_subjects")
      .select("sequence")
      .eq("class", className)
      .eq("section", section)
      .order("sequence", { ascending: false })
      .limit(1)
      .maybeSingle();

    let currentSequence = (lastSubject?.sequence || 0) + 1;

    // Prepare insert data with section
    const insertData = newSubjectIds.map((subject_id) => ({
      class: className,
      subject_id: subject_id,
      sequence: currentSequence++,
      section: section,
    }));

    // Insert all subjects
    const { data, error } = await supabase
      .from("class_subjects")
      .insert(insertData)
      .select(`
        id,
        class,
        section,
        sequence,
        subjects (
          id,
          name,
          code
        )
      `);

    if (error) {
      console.error("Add multiple subjects error:", error);
      return res.status(500).json({ 
        message: "Failed to add subjects",
        error: error.message 
      });
    }

    res.status(201).json({
      success: true,
      message: `${data.length} subject(s) added to class "${className}" successfully`,
      added: data.length,
      skipped: subject_ids.length - newSubjectIds.length,
      data: data,
    });
  } catch (err) {
    console.error("Add multiple subjects error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

