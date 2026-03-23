import { supabase } from "../services/supabase.js";

const TERM_ALIASES = {
  first: "first",
  "1": "first",
  second: "second",
  "2": "second",
  third: "third",
  "3": "third",
  final: "third",
  annual: "third",
  "third/final": "third",
};

const NON_NUMERIC_MARK_TOKENS = new Set(["AB", "NA", "N/A", "ABSENT", "A"]);

const TERM_DB_LABEL = {
  first: "First",
  second: "Second",
  third: "Third",
};

const TERM_SUMMARY_SCOPE = {
  first: ["first"],
  second: ["first", "second"],
  third: ["first", "second", "third"],
};

const toSafeString = (value) => String(value ?? "").trim();

const buildAcademicYearCandidates = (value) => {
  const raw = toSafeString(value);
  if (!raw) return [];

  const normalized = raw.replace(/\s+/g, "");
  const shortMatch = normalized.match(/^(\d{4})-(\d{2})$/);
  if (shortMatch) {
    const startYear = shortMatch[1];
    const endShort = shortMatch[2];
    const endLong = `${startYear.slice(0, 2)}${endShort}`;
    return Array.from(new Set([normalized, `${startYear}-${endLong}`]));
  }

  const longMatch = normalized.match(/^(\d{4})-(\d{4})$/);
  if (longMatch) {
    const startYear = longMatch[1];
    const endLong = longMatch[2];
    const endShort = endLong.slice(-2);
    return Array.from(new Set([normalized, `${startYear}-${endShort}`]));
  }

  return [];
};

const normalizeTermToken = (value) => {
  const compact = toSafeString(value).toLowerCase().replace(/\s+/g, "");
  return compact.endsWith("term") ? compact.slice(0, -4) : compact;
};

const normalizeInputTerm = (value) => {
  const normalized = normalizeTermToken(value);
  return TERM_ALIASES[normalized] || null;
};

const normalizeStoredTerm = (row) => {
  const raw = normalizeTermToken(row?.term || row?.terminal);
  return TERM_ALIASES[raw] || null;
};

const isDrawingSubject = (name, code) => {
  const normalizedName = toSafeString(name).toLowerCase();
  const normalizedCode = toSafeString(code).toLowerCase();
  return (
    normalizedName.includes("drawing") ||
    normalizedCode.includes("drawing") ||
    normalizedCode === "drw"
  );
};

const parseMarkValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return {
      isNumeric: false,
      numericValue: null,
      displayValue: "AB",
      kind: "missing",
    };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return {
        isNumeric: false,
        numericValue: null,
        displayValue: "AB",
        kind: "invalid",
      };
    }
    return {
      isNumeric: true,
      numericValue: value,
      displayValue: value,
      kind: "numeric",
    };
  }

  const raw = toSafeString(value);
  const upperRaw = raw.toUpperCase();

  if (!raw) {
    return {
      isNumeric: false,
      numericValue: null,
      displayValue: "AB",
      kind: "missing",
    };
  }

  if (NON_NUMERIC_MARK_TOKENS.has(upperRaw)) {
    return {
      isNumeric: false,
      numericValue: null,
      displayValue: upperRaw === "ABSENT" ? "AB" : upperRaw,
      kind: "non_numeric",
    };
  }

  const parsed = Number(raw);
  if (Number.isFinite(parsed)) {
    return {
      isNumeric: true,
      numericValue: parsed,
      displayValue: parsed,
      kind: "numeric",
    };
  }

  return {
    isNumeric: false,
    numericValue: null,
    displayValue: raw,
    kind: "invalid",
  };
};

const toNumberOrDefault = (value, fallbackValue) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackValue;
};

const divisionFromPercentage = (percentage) => {
  if (percentage >= 60) return "First";
  if (percentage >= 45) return "Second";
  if (percentage >= 33) return "Third";
  return "Fail";
};

const rowTimestamp = (row) => {
  const source = row?.updated_at || row?.created_at || row?.calculated_at || null;
  if (!source) return 0;
  const ts = new Date(source).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const buildSubjectKey = (row, subjectMeta) => {
  if (row?.subject_id) {
    return `id:${row.subject_id}`;
  }

  const subjectName = toSafeString(row?.subject || row?.subject_name || subjectMeta?.name).toLowerCase();
  return subjectName ? `name:${subjectName}` : `row:${row?.id || Math.random()}`;
};

const isPublishedSummary = (status) =>
  String(status || "").trim().toUpperCase() === "PUBLISHED";

const dedupeRowsByTermAndSubject = (rows, subjectMap) => {
  const map = new Map();

  for (const row of rows || []) {
    const term = normalizeStoredTerm(row);
    if (!term) continue;

    const subjectMeta = row?.subject_id ? subjectMap.get(String(row.subject_id)) : null;
    const dedupeKey = `${term}|${buildSubjectKey(row, subjectMeta)}`;
    const existing = map.get(dedupeKey);

    if (!existing || rowTimestamp(row) >= rowTimestamp(existing)) {
      map.set(dedupeKey, row);
    }
  }

  return Array.from(map.values());
};

const validateRowValues = ({
  row,
  subjectName,
  termKey,
  drawingSubject,
  externalValue,
  internalValue,
}) => {
  const errors = [];
  const context = `Term ${termKey.toUpperCase()}, Subject "${subjectName}"`;

  if (externalValue.kind === "invalid") {
    errors.push(`${context}: external marks must be numeric or AB/NA`);
  }
  if (internalValue.kind === "invalid") {
    errors.push(`${context}: internal marks must be numeric or AB/NA`);
  }

  if (externalValue.isNumeric && externalValue.numericValue < 0) {
    errors.push(`${context}: external marks cannot be negative`);
  }
  if (internalValue.isNumeric && internalValue.numericValue < 0) {
    errors.push(`${context}: internal marks cannot be negative`);
  }

  if (drawingSubject) {
    if (externalValue.isNumeric && externalValue.numericValue > 50) {
      errors.push(`${context}: drawing external marks cannot exceed 50`);
    }
    if (internalValue.isNumeric && internalValue.numericValue > 0) {
      errors.push(`${context}: drawing cannot have internal marks`);
    }
  } else {
    if (externalValue.isNumeric && externalValue.numericValue > 80) {
      errors.push(`${context}: external marks cannot exceed 80`);
    }
    if (internalValue.isNumeric && internalValue.numericValue > 20) {
      errors.push(`${context}: internal marks cannot exceed 20`);
    }
  }

  return errors;
};

const buildTermRowView = (row, subjectMap) => {
  const subjectMeta = row?.subject_id ? subjectMap.get(String(row.subject_id)) : null;
  const subjectName =
    toSafeString(row?.subject || row?.subject_name || subjectMeta?.name) || "Unknown";
  const subjectCode = toSafeString(row?.subject_code || subjectMeta?.code);
  const drawingSubject = isDrawingSubject(subjectName, subjectCode);

  const externalMarks = parseMarkValue(row?.external_marks);
  const internalMarks = parseMarkValue(row?.internal_marks);

  const defaultExternalFull = drawingSubject ? 50 : 80;
  const defaultInternalFull = drawingSubject ? 0 : 20;

  const fullMarksExternal = toNumberOrDefault(
    row?.full_marks_external ?? subjectMeta?.max_external_marks,
    defaultExternalFull
  );
  const fullMarksInternal = drawingSubject
    ? 0
    : toNumberOrDefault(
        row?.full_marks_internal ?? subjectMeta?.max_internal_marks,
        defaultInternalFull
      );

  const obtained =
    (externalMarks.isNumeric ? externalMarks.numericValue : 0) +
    (internalMarks.isNumeric ? internalMarks.numericValue : 0);

  return {
    termKey: normalizeStoredTerm(row),
    subjectName,
    subjectCode,
    drawingSubject,
    externalMarks,
    internalMarks,
    fullMarksExternal,
    fullMarksInternal,
    obtained,
  };
};

const fetchStudentByClassRoll = async ({
  className,
  rollNoInput,
  section,
  academicYears,
}) => {
  const pickBestStudent = (rows = []) => {
    if (!rows.length) return null;

    const sorted = [...rows].sort((a, b) => {
      const aStatus = String(a?.status || "").toLowerCase();
      const bStatus = String(b?.status || "").toLowerCase();
      if (aStatus !== bStatus) {
        if (aStatus === "active") return -1;
        if (bStatus === "active") return 1;
      }

      const aYear = String(a?.academic_year || "");
      const bYear = String(b?.academic_year || "");
      if (aYear !== bYear) return bYear.localeCompare(aYear);

      const aCreated = new Date(a?.created_at || 0).getTime();
      const bCreated = new Date(b?.created_at || 0).getTime();
      if (aCreated !== bCreated) return bCreated - aCreated;

      return String(a?.id || "").localeCompare(String(b?.id || ""));
    });

    return sorted[0];
  };

  const runQuery = async (rollValue) => {
    let query = supabase
      .from("students")
      .select("id, name, father_name, mother_name, class, section, roll_no, academic_year, status, created_at")
      .eq("class", className)
      .eq("roll_no", rollValue)
      .eq("status", "active")
      .order("academic_year", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(5);

    if (section) {
      query = query.ilike("section", section);
    }

    if (academicYears?.length) {
      query = query.in("academic_year", academicYears);
    }

    return query;
  };

  const numericRoll = Number(rollNoInput);
  const { data: numericData, error: numericError } = await runQuery(numericRoll);
  if (numericError) {
    throw new Error(`Failed to fetch student: ${numericError.message}`);
  }

    if (numericData?.length) {
      return numericData;
    }

  const { data: numericFallbackData, error: numericFallbackError } = await supabase
    .from("students")
    .select("id, name, father_name, mother_name, class, section, roll_no, academic_year, status, created_at")
    .eq("class", className)
    .eq("roll_no", numericRoll)
    .eq("status", "active")
    .order("academic_year", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (numericFallbackError) {
    throw new Error(`Failed to fetch student: ${numericFallbackError.message}`);
  }

  if (numericFallbackData?.length) {
    return numericFallbackData;
  }

  const textRoll = toSafeString(rollNoInput);
  if (!textRoll || String(numericRoll) === textRoll) {
    return [];
  }

  const { data: textData, error: textError } = await runQuery(textRoll);
  if (textError) {
    throw new Error(`Failed to fetch student: ${textError.message}`);
  }

  if (textData?.length) {
    return textData;
  }

  const { data: textFallbackData, error: textFallbackError } = await supabase
    .from("students")
    .select("id, name, father_name, mother_name, class, section, roll_no, academic_year, status, created_at")
    .eq("class", className)
    .eq("roll_no", textRoll)
    .eq("status", "active")
    .order("academic_year", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (textFallbackError) {
    throw new Error(`Failed to fetch student: ${textFallbackError.message}`);
  }

  return textFallbackData || [];
};

const fetchSubjectMap = async (subjectIds) => {
  if (!subjectIds.length) return new Map();

  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, code")
    .in("id", subjectIds);

  if (error) {
    throw new Error(`Failed to fetch subject metadata: ${error.message}`);
  }

  const subjectMap = new Map();
  (data || []).forEach((subject) => {
    subjectMap.set(String(subject.id), subject);
  });

  return subjectMap;
};

/**
 * Production-grade student result API.
 * Query:
 * - class (required)
 * - roll (required)
 * - term (required): first | second | third | final
 * - section (optional)
 * - academic_year (required)
 */
export const getResult = async (req, res) => {
  try {
    const className = toSafeString(req.query.class);
    const rollInput = toSafeString(req.query.roll);
    const termInput = toSafeString(req.query.term || req.query.terminal);
    const section = toSafeString(req.query.section) || null;
    const academicYearRaw = toSafeString(
      req.query.academic_year || req.query.session || req.query.academic_session
    );
    const academicYears = buildAcademicYearCandidates(academicYearRaw);

    if (!className || !rollInput || !termInput || !academicYearRaw) {
      return res.status(400).json({
        message: "class, roll, term, and academic_year are required",
      });
    }

    if (!academicYears.length) {
      return res.status(400).json({
        message: "academic_year must be in format YYYY-YY or YYYY-YYYY",
      });
    }

    if (!/^\d+$/.test(rollInput) || Number(rollInput) <= 0) {
      return res.status(400).json({
        message: "roll must be a positive numeric value",
      });
    }

    const normalizedTerm = normalizeInputTerm(termInput);
    if (!normalizedTerm) {
      return res.status(400).json({
        message: "term must be one of: first, second, third, final",
      });
    }

    const students = await fetchStudentByClassRoll({
      className,
      rollNoInput: rollInput,
      section,
      academicYears,
    });

    if (!students.length) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    const currentTermLabel = TERM_DB_LABEL[normalizedTerm];

    const findPublishedStudent = async (candidates) => {
      for (const candidate of candidates) {
        const { data: candidateSummary, error: candidateError } = await supabase
          .from("result_summary")
          .select("status, total_marks, total_obtained, percentage, division, rank, calculated_at")
          .eq("student_id", candidate.id)
          .eq("terminal", currentTermLabel)
          .maybeSingle();

        if (candidateError || !candidateSummary) continue;
        if (isPublishedSummary(candidateSummary.status)) {
          return candidate;
        }
      }

      return candidates[0];
    };

    const student = await findPublishedStudent(students);

    let resolvedStudent = student;
    if (!resolvedStudent) {
      const { data: publishedStudentRows } = await supabase
        .from("result_summary")
        .select(`
          calculated_at,
          status,
          terminal,
          students!inner (
            id,
            name,
            father_name,
            mother_name,
            class,
            section,
            roll_no,
            academic_year,
            status
          )
        `)
        .eq("terminal", currentTermLabel)
        .eq("status", "Published")
        .eq("students.class", className)
        .eq("students.status", "active")
        .eq("students.roll_no", Number(rollInput))
        .limit(5);

      const fallbackMatch = (publishedStudentRows || []).find((row) => {
        const rowStudent = row?.students;
        if (!rowStudent) return false;
        if (section && String(rowStudent.section || "").trim() !== String(section).trim()) return false;
        if (academicYears?.length) {
          return academicYears.includes(String(rowStudent.academic_year || "").trim());
        }
        return true;
      });

      if (fallbackMatch?.students) {
        resolvedStudent = {
          id: fallbackMatch.students.id,
          name: fallbackMatch.students.name,
          father_name: fallbackMatch.students.father_name || null,
          mother_name: fallbackMatch.students.mother_name || null,
          class: fallbackMatch.students.class,
          section: fallbackMatch.students.section,
          roll_no: fallbackMatch.students.roll_no,
          academic_year: fallbackMatch.students.academic_year || null,
          status: fallbackMatch.students.status || null,
        };
      }
    }

    const finalStudent = resolvedStudent;

    const { data: publishedSummary, error: publishedError } = await supabase
      .from("result_summary")
      .select("status, total_marks, total_obtained, percentage, division, rank, calculated_at")
      .eq("student_id", finalStudent.id)
      .eq("terminal", currentTermLabel)
      .maybeSingle();

    if (publishedError) {
      return res.status(500).json({
        message: "Failed to fetch published result",
        error: publishedError.message,
      });
    }

    if (!publishedSummary || !isPublishedSummary(publishedSummary.status)) {
      return res.status(404).json({
        message: "Result not published yet",
      });
    }

    const { data: rawMarks, error: marksError } = await supabase
      .from("marks")
      .select("*")
      .eq("student_id", finalStudent.id);

    if (marksError) {
      return res.status(500).json({
        message: "Failed to fetch marks",
        error: marksError.message,
      });
    }

    const marks = rawMarks || [];
    const scopedTerms = TERM_SUMMARY_SCOPE[normalizedTerm];
    const dedupedMarks = dedupeRowsByTermAndSubject(
      marks.filter((row) => scopedTerms.includes(normalizeStoredTerm(row))),
      new Map()
    );

    if (!dedupedMarks.length) {
      return res.status(404).json({
        message: "No marks found for the requested term scope",
      });
    }

    const subjectIds = Array.from(
      new Set(dedupedMarks.map((row) => row.subject_id).filter(Boolean).map(String))
    );
    const subjectMap = await fetchSubjectMap(subjectIds);

    const selectedTermRows = dedupedMarks.filter(
      (row) => normalizeStoredTerm(row) === normalizedTerm
    );

    if (!selectedTermRows.length) {
      return res.status(404).json({
        message: `No marks found for ${TERM_DB_LABEL[normalizedTerm]} term`,
      });
    }

    const validationErrors = [];
    const marksDetails = selectedTermRows
      .map((row) => buildTermRowView(row, subjectMap))
      .map((rowView) => {
        validationErrors.push(
          ...validateRowValues({
            row: null,
            subjectName: rowView.subjectName,
            termKey: rowView.termKey,
            drawingSubject: rowView.drawingSubject,
            externalValue: rowView.externalMarks,
            internalValue: rowView.internalMarks,
          })
        );

        return {
          subject: rowView.subjectName,
          subjectCode: rowView.subjectCode || null,
          term: TERM_DB_LABEL[rowView.termKey] || rowView.termKey,
          externalMarks: rowView.externalMarks.displayValue,
          internalMarks: rowView.drawingSubject
            ? null
            : rowView.internalMarks.displayValue,
          fullMarksExternal: rowView.fullMarksExternal,
          fullMarksInternal: rowView.fullMarksInternal,
          obtained: Number(rowView.obtained.toFixed(2)),
          // Backward-compatible aliases
          code: rowView.subjectCode || null,
          max_marks: Number((rowView.fullMarksExternal + rowView.fullMarksInternal).toFixed(2)),
          external_marks: rowView.externalMarks.displayValue,
          internal_marks: rowView.drawingSubject
            ? "AB"
            : rowView.internalMarks.displayValue,
          total_obtained: Number(rowView.obtained.toFixed(2)),
        };
      })
      .sort((a, b) => a.subject.localeCompare(b.subject));

    let totalObtained = 0;
    let totalFullMarks = 0;

    dedupedMarks.forEach((row) => {
      const rowView = buildTermRowView(row, subjectMap);
      validationErrors.push(
        ...validateRowValues({
          row,
          subjectName: rowView.subjectName,
          termKey: rowView.termKey,
          drawingSubject: rowView.drawingSubject,
          externalValue: rowView.externalMarks,
          internalValue: rowView.internalMarks,
        })
      );

      if (rowView.externalMarks.isNumeric) {
        totalObtained += rowView.externalMarks.numericValue;
        totalFullMarks += rowView.fullMarksExternal;
      }
      if (rowView.internalMarks.isNumeric) {
        totalObtained += rowView.internalMarks.numericValue;
        totalFullMarks += rowView.fullMarksInternal;
      }
    });

    if (validationErrors.length) {
      return res.status(422).json({
        message: "Invalid marks data found",
        errors: Array.from(new Set(validationErrors)),
      });
    }

    const roundedTotalObtained = Number(totalObtained.toFixed(2));
    const roundedTotalFullMarks = Number(totalFullMarks.toFixed(2));
    const percentage = Number(
      toNumberOrDefault(publishedSummary.percentage, 0).toFixed(2)
    );
    const division = publishedSummary.division || divisionFromPercentage(percentage);

    const studentDetails = {
      id: finalStudent.id,
      name: finalStudent.name,
      fatherName: finalStudent.father_name || null,
      motherName: finalStudent.mother_name || null,
      class: finalStudent.class,
      section: finalStudent.section || null,
      rollNumber: finalStudent.roll_no,
      academicYear: finalStudent.academic_year || null,
      term: currentTermLabel,
    };

    const summary = {
      totalObtained: Number(toNumberOrDefault(publishedSummary.total_obtained, roundedTotalObtained).toFixed(2)),
      totalFullMarks: Number(toNumberOrDefault(publishedSummary.total_marks, roundedTotalFullMarks).toFixed(2)),
      percentage,
      division,
      // Backward-compatible aliases
      total_obtained: Number(toNumberOrDefault(publishedSummary.total_obtained, roundedTotalObtained).toFixed(2)),
      total_max_marks: Number(toNumberOrDefault(publishedSummary.total_marks, roundedTotalFullMarks).toFixed(2)),
      status: "Published",
      rank: publishedSummary.rank ?? null,
      published_date: publishedSummary.calculated_at
        ? new Date(publishedSummary.calculated_at).toISOString().split("T")[0]
        : null,
    };

    return res.json({
      studentDetails,
      marksDetails,
      summary,
      // Backward-compatible response keys for existing frontend
      student: {
        id: studentDetails.id,
        name: studentDetails.name,
        father_name: finalStudent.father_name || null,
        mother_name: finalStudent.mother_name || null,
        class: studentDetails.class,
        section: studentDetails.section,
        roll_no: studentDetails.rollNumber,
        academic_year: studentDetails.academicYear,
      },
      terminal: currentTermLabel,
      marks: marksDetails,
    });
  } catch (error) {
    console.error("Get result error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
