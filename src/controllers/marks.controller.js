import { supabase } from "../services/supabase.js";

const PROMOTION_TERMINALS = new Set(["annual", "final"]);
const ALLOWED_RESULT_TERMINALS = new Set(["first", "second", "third", "annual"]);
const PASSED_OUT_CLASS = "Passed Out";
const PASSED_OUT_STATUS = "Passed Out";

const normalizePromotionTerminal = (terminal) =>
  String(terminal || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "")
    .replace(/term$/, "");

const normalizeClassForPromotion = (className) => {
  const value = String(className || "").trim().toUpperCase();
  const compact = value.replace(/[\s.]/g, "");

  if (compact === "MOTHERCARE") return "MOTHER CARE";
  if (compact === "LKG") return "LKG";
  if (compact === "UKG") return "UKG";
  if (/^[1-8]$/.test(compact)) return compact;

  return value;
};

const getPromotionTarget = (className) => {
  const normalizedClass = normalizeClassForPromotion(className);

  if (normalizedClass === "MOTHER CARE") return { nextClass: "LKG", passedOut: false };
  if (normalizedClass === "LKG") return { nextClass: "UKG", passedOut: false };
  if (normalizedClass === "UKG") return { nextClass: "1", passedOut: false };
  if (normalizedClass === "1") return { nextClass: "2", passedOut: false };
  if (normalizedClass === "2") return { nextClass: "3", passedOut: false };
  if (normalizedClass === "3") return { nextClass: "4", passedOut: false };
  if (normalizedClass === "4") return { nextClass: "5", passedOut: false };
  if (normalizedClass === "5") return { nextClass: "6", passedOut: false };
  if (normalizedClass === "6") return { nextClass: "7", passedOut: false };
  if (normalizedClass === "7") return { nextClass: "8", passedOut: false };
  if (normalizedClass === "8") return { nextClass: PASSED_OUT_CLASS, passedOut: true };

  return null;
};

const shouldAutoPromote = (terminal) =>
  PROMOTION_TERMINALS.has(normalizePromotionTerminal(terminal));

const isMissingColumnError = (error, columnName) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("column") &&
    message.includes(String(columnName || "").toLowerCase()) &&
    (message.includes("does not exist") || message.includes("schema cache"))
  );
};

const buildAcademicYearCandidates = (value) => {
  const raw = String(value || "").trim();
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

const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
};

const RESULT_BY_ROLL_CACHE_TTL_MS = toPositiveInt(
  process.env.RESULT_BY_ROLL_CACHE_TTL_MS,
  60000
);
const MARKS_BY_CLASS_CACHE_TTL_MS = toPositiveInt(
  process.env.MARKS_BY_CLASS_CACHE_TTL_MS,
  30000
);
const MAX_READ_CACHE_ITEMS = toPositiveInt(
  process.env.READ_CACHE_MAX_ITEMS,
  300
);
const RESULT_TERMINAL_LABELS = ["First", "Second", "Third", "Annual"];
const RESULT_BY_ROLL_RESPONSE_VERSION = "v2";

const readResponseCache = new Map();

const buildReadCacheKey = (prefix, params = {}) => {
  const serialized = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value).trim()}`)
    .join("&");

  return `${prefix}:${serialized}`;
};

const getCachedReadResponse = (key) => {
  const entry = readResponseCache.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    readResponseCache.delete(key);
    return null;
  }

  return entry.payload;
};

const trimReadCache = () => {
  const now = Date.now();
  for (const [key, entry] of readResponseCache) {
    if (entry.expiresAt <= now) {
      readResponseCache.delete(key);
    }
  }

  while (readResponseCache.size > MAX_READ_CACHE_ITEMS) {
    const oldestKey = readResponseCache.keys().next().value;
    if (!oldestKey) break;
    readResponseCache.delete(oldestKey);
  }
};

const setCachedReadResponse = (key, payload, ttlMs) => {
  if (!payload || ttlMs <= 0) return;

  readResponseCache.set(key, {
    payload,
    expiresAt: Date.now() + ttlMs,
  });

  if (readResponseCache.size > MAX_READ_CACHE_ITEMS) {
    trimReadCache();
  }
};

const setReadCacheHeaders = ({
  res,
  ttlMs,
  cacheHit,
  visibility = "public",
}) => {
  const seconds = Math.max(0, Math.floor(ttlMs / 1000));
  res.set("Cache-Control", `${visibility}, max-age=${seconds}, stale-while-revalidate=${seconds}`);
  res.set("X-Cache", cacheHit ? "HIT" : "MISS");
};

const invalidateReadCacheByPrefix = (prefixes = []) => {
  if (!prefixes.length) {
    readResponseCache.clear();
    return;
  }

  for (const key of Array.from(readResponseCache.keys())) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      readResponseCache.delete(key);
    }
  }
};

const normalizeResultTerminalLabel = (value) => {
  const token = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/term$/, "");
  const compact = token.replace(/[\/_-]/g, "");

  if (token === "1" || token === "first") return "First";
  if (token === "2" || token === "second") return "Second";
  if (token === "3" || token === "third") return "Third";
  if (
    token === "annual" ||
    token === "final" ||
    token === "third/final" ||
    compact === "thirdfinal"
  ) {
    return "Annual";
  }

  return null;
};

/**
 * Resolve class subjects with section-first strategy.
 * - If section-specific mappings exist, use them.
 * - Otherwise fallback to class-level mappings.
 */
const fetchClassSubjectsWithFallback = async (className, section) => {
  let classSubjects = null;
  let csError = null;

  if (section) {
    const { data: sectionData, error: sectionError } = await supabase
      .from("class_subjects")
      .select(`
        subject_id,
        section,
        sequence,
        subjects (
          id,
          name,
          code
        )
      `)
      .eq("class", className)
      .eq("section", section)
      .order("sequence", { ascending: true });

    if (!sectionError && sectionData && sectionData.length > 0) {
      classSubjects = sectionData;
    }
  }

  if (!classSubjects) {
    const { data: allData, error: allError } = await supabase
      .from("class_subjects")
      .select(`
        subject_id,
        section,
        sequence,
        subjects (
          id,
          name,
          code
        )
      `)
      .eq("class", className)
      .order("sequence", { ascending: true });

    classSubjects = allData;
    csError = allError;
  }

  return { classSubjects, csError };
};

const isProvided = (value) =>
  value !== undefined && value !== null && String(value).trim() !== "";

const parseMark = (value, fieldLabel) => {
  if (!isProvided(value)) return { hasValue: false, value: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { error: `${fieldLabel} must be a valid number` };
  }
  return { hasValue: true, value: parsed };
};

const isDrawingSubject = (subject) => {
  const name = String(subject?.name || "").toLowerCase();
  const code = String(subject?.code || "").toLowerCase();
  return name.includes("drawing") || code.includes("drawing") || code === "drw";
};

const validateAndNormalizeSubjectMarks = ({
  subject,
  external_marks,
  internal_marks,
}) => {
  const subjectLabel = `${subject?.name || "Unknown"}${subject?.code ? ` (${subject.code})` : ""}`;
  const external = parseMark(external_marks, `External marks for ${subjectLabel}`);
  const internal = parseMark(internal_marks, `Internal marks for ${subjectLabel}`);

  if (external.error) return { error: external.error };
  if (internal.error) return { error: internal.error };

  if (external.hasValue && external.value < 0) {
    return { error: `External marks for ${subjectLabel} cannot be negative` };
  }

  if (internal.hasValue && internal.value < 0) {
    return { error: `Internal marks for ${subjectLabel} cannot be negative` };
  }

  if (isDrawingSubject(subject)) {
    if (internal.hasValue) {
      return { error: `Internal marks are not allowed for Drawing (${subjectLabel}). Only external marks are allowed` };
    }
    if (external.hasValue && external.value > 50) {
      return { error: `External marks for Drawing (${subjectLabel}) cannot exceed 50` };
    }
  } else {
    if (external.hasValue && external.value > 80) {
      return { error: `External marks for ${subjectLabel} cannot exceed 80` };
    }
    if (internal.hasValue && internal.value > 20) {
      return { error: `Internal marks for ${subjectLabel} cannot exceed 20` };
    }
  }

  return {
    external_marks: external.hasValue ? external.value : null,
    internal_marks: internal.hasValue ? internal.value : null,
  };
};

const getSubjectMaxMarks = (subject) => {
  const externalMax = Number(subject?.max_external_marks);
  const internalMax = Number(subject?.max_internal_marks);
  const hasExternalMax = Number.isFinite(externalMax) && externalMax >= 0;
  const hasInternalMax = Number.isFinite(internalMax) && internalMax >= 0;

  if (hasExternalMax || hasInternalMax) {
    return (hasExternalMax ? externalMax : 0) + (hasInternalMax ? internalMax : 0);
  }

  return isDrawingSubject(subject) ? 50 : 100;
};

/**
 * Helper: Get result summary for a single terminal
 */
const getTerminalResult = async (student, cls, section, terminal, classSubjects) => {
  try {
    const subjectIds = classSubjects.map((cs) => cs.subject_id || cs.subjects?.id).filter(Boolean);
    
    const { data: marksData, error: marksError } = await supabase
      .from("marks")
      .select("*")
      .eq("student_id", student.id)
      .eq("terminal", terminal)
      .in("subject_id", subjectIds);

    if (marksError) {
      console.error(`Error fetching marks for terminal ${terminal}:`, marksError);
      return null;
    }

    // Build marks map
    const marksMap = {};
    marksData?.forEach((m) => {
      marksMap[m.subject_id] = {
        external: m.external_marks,
        internal: m.internal_marks,
        total: (m.external_marks || 0) + (m.internal_marks || 0),
      };
    });

    // Calculate summary
    let totalMaxMarks = 0;
    let totalObtained = 0;
    const marksDetails = [];

    classSubjects.forEach((cs) => {
      const subject = cs.subjects;
      if (!subject || !subject.id) return;
      
      const maxMarks = getSubjectMaxMarks(subject);
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
      percentage >= 60 ? "First"
      : percentage >= 45 ? "Second"
      : percentage >= 33 ? "Third"
      : "Fail";

    // Check if published
    const { data: publishedSummary } = await supabase
      .from("result_summary")
      .select("status, total_marks, total_obtained, percentage, division, rank, calculated_at")
      .eq("student_id", student.id)
      .eq("terminal", terminal)
      .maybeSingle();

    let finalTotalMaxMarks = totalMaxMarks;
    let finalTotalObtained = totalObtained;
    let finalPercentage = percentage;
    let finalDivision = division;
    let finalRank = null;
    let publishedDate = null;
    const status = publishedSummary?.status || (totalObtained > 0 ? "Pending" : "Pending");

    if (publishedSummary && publishedSummary.status === "Published") {
      finalTotalMaxMarks = publishedSummary.total_marks || totalMaxMarks;
      finalTotalObtained = publishedSummary.total_obtained || totalObtained;
      finalPercentage = publishedSummary.percentage || percentage;
      finalDivision = publishedSummary.division || division;
      finalRank = publishedSummary.rank || null;
      if (publishedSummary.calculated_at) {
        publishedDate = new Date(publishedSummary.calculated_at).toISOString().split('T')[0];
      }
    }

    const totalObtainedRounded = finalTotalObtained > 0 ? Math.round(finalTotalObtained * 100) / 100 : 0;
    const percentageNum = parseFloat(finalPercentage);

    return {
      terminal,
      marks: marksDetails,
      summary: {
        total_max_marks: finalTotalMaxMarks,
        total_obtained: totalObtainedRounded,
        percentage: percentageNum,
        division: finalDivision,
        rank: finalRank,
        status,
        published_date: publishedDate,
      },
    };
  } catch (err) {
    console.error(`Error in getTerminalResult for ${terminal}:`, err);
    return null;
  }
};

/**
 * Get annual result (all terminals combined)
 */
const getAnnualResult = async (req, res, cls, roll, section) => {
  try {
    // Fetch student
    let studentQuery = supabase
      .from("students")
      .select("*")
      .eq("class", cls)
      .eq("roll_no", Number(roll));
    
    if (section) {
      studentQuery = studentQuery.eq("section", section);
    }
    
    const { data: student, error: studentError } = await studentQuery.single();

    if (studentError || !student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Get class subjects
    let classSubjects = null;
    
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
      }
    }

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
      if (allError) {
        return res.status(500).json({ 
          message: "Failed to fetch subjects for this class",
          error: allError.message 
        });
      }
    }

    if (!classSubjects || classSubjects.length === 0) {
      return res.status(404).json({ 
        message: `No subjects found for class "${cls}"`,
      });
    }

    // Fetch results for all three terminals
    const terminals = ["First", "Second", "Third"];
    const allResults = [];

    for (const term of terminals) {
      const result = await getTerminalResult(student, cls, section, term, classSubjects);
      if (result) {
        allResults.push(result);
      }
    }

    // Calculate annual totals
    let annualTotalMaxMarks = 0;
    let annualTotalObtained = 0;

    allResults.forEach(result => {
      annualTotalMaxMarks += result.summary.total_max_marks;
      annualTotalObtained += result.summary.total_obtained;
    });

    const annualPercentage = annualTotalMaxMarks > 0 
      ? parseFloat(((annualTotalObtained / annualTotalMaxMarks) * 100).toFixed(2))
      : 0;

    const annualDivision =
      annualPercentage >= 60 ? "First"
      : annualPercentage >= 45 ? "Second"
      : annualPercentage >= 33 ? "Third"
      : "Fail";

    // Response with all terminals
    res.json({
      student: {
        id: student.id,
        name: student.name,
        father_name: student.father_name,
        mother_name: student.mother_name || null,
        class: student.class,
        roll_no: student.roll_no,
        section: student.section,
      },
      terminal: "All",
      terminals: allResults,
      annual_summary: {
        total_max_marks: annualTotalMaxMarks,
        total_obtained: annualTotalObtained,
        percentage: annualPercentage,
        division: annualDivision,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal server error" });
  }
};

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
          code
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
 * For all terminals: ?class=UKG&roll=5&terminal=All
 */
export const getResultByClassRoll = async (req, res) => {
  try {
    const {
      class: cls,
      roll,
      terminal,
      term,
      section,
      academic_year: academicYear,
    } = req.query;
    const requestedAcademicYearRaw = String(
      academicYear || req.query?.session || req.query?.academic_session || ""
    ).trim();
    const hasRequestedAcademicYear = requestedAcademicYearRaw.length > 0;
    const requestedAcademicYears = buildAcademicYearCandidates(
      requestedAcademicYearRaw
    );

    const requestedTerminalRaw = String(terminal || term || "").trim();

    if (!cls || !roll || !requestedTerminalRaw) {
      return res.status(400).json({
        message: "class, roll, and terminal are required",
      });
    }

    if (hasRequestedAcademicYear && !requestedAcademicYears.length) {
      return res.status(400).json({
        message: "academic_year must be in format YYYY-YY or YYYY-YYYY",
      });
    }

    const normalizeStoredTerminal = (value) => {
      const normalized = normalizeResultTerminalLabel(value);
      if (!normalized) return null;
      return normalized;
    };

    const requestedTerminal = normalizeResultTerminalLabel(requestedTerminalRaw);
    if (!requestedTerminal) {
      return res.status(404).json({
        message: "Result not found",
      });
    }

    if (!/^\d+$/.test(String(roll).trim()) || Number(roll) <= 0) {
      return res.status(400).json({
        message: "roll must be a positive numeric value",
      });
    }

    const resultCacheBaseKey = buildReadCacheKey("resultByRoll", {
      version: RESULT_BY_ROLL_RESPONSE_VERSION,
      class: cls,
      roll,
      section,
      academic_year: requestedAcademicYearRaw,
    });
    const buildResultCacheKeyForTerminal = (terminalLabel) =>
      `${resultCacheBaseKey}&terminal=${terminalLabel}`;
    const requestedResultCacheKey = buildResultCacheKeyForTerminal(requestedTerminal);

    const cachedResultPayload = getCachedReadResponse(requestedResultCacheKey);
    if (cachedResultPayload) {
      setReadCacheHeaders({
        res,
        ttlMs: RESULT_BY_ROLL_CACHE_TTL_MS,
        cacheHit: true,
        visibility: "public",
      });
      return res.json(cachedResultPayload);
    }

    const buildStudentQuery = () => {
      let query = supabase
        .from("students")
        .select("*")
        .eq("class", cls)
        .eq("roll_no", Number(roll));

      if (section) {
        query = query.eq("section", section);
      }

      return query;
    };

    const extractDistinctValues = (rows, key) =>
      Array.from(
        new Set(
          (rows || [])
            .map((row) => String(row?.[key] || "").trim())
            .filter(Boolean)
        )
      );

    let studentQuery = buildStudentQuery();
    if (hasRequestedAcademicYear) {
      studentQuery = studentQuery.in("academic_year", requestedAcademicYears);
    }

    const { data: students, error: studentError } = await studentQuery.limit(20);

    if (studentError) {
      return res.status(500).json({
        message: "Failed to fetch student",
        error: studentError.message,
      });
    }

    if (!students?.length) {
      if (hasRequestedAcademicYear) {
        const { data: fallbackStudents } = await buildStudentQuery().limit(20);
        const availableAcademicYears = extractDistinctValues(
          fallbackStudents,
          "academic_year"
        );

        return res.status(404).json({
          message: `Student not found for academic_year "${requestedAcademicYearRaw}"`,
          available_academic_years:
            availableAcademicYears.length > 0 ? availableAcademicYears : undefined,
        });
      }

      return res.status(404).json({
        message: "Student not found",
      });
    }

    let resolvedStudents = students;
    if (!hasRequestedAcademicYear) {
      const activeStudents = students.filter(
        (row) => String(row?.status || "").toLowerCase() === "active"
      );
      if (activeStudents.length === 1) {
        resolvedStudents = activeStudents;
      }
    }

    if (resolvedStudents.length > 1) {
      const availableSections = extractDistinctValues(resolvedStudents, "section");
      if (!section && availableSections.length > 1) {
        return res.status(409).json({
          message: "Multiple students found for the same class and roll. Provide section.",
          sections: availableSections,
        });
      }

      if (!hasRequestedAcademicYear) {
        const availableAcademicYears = extractDistinctValues(
          resolvedStudents,
          "academic_year"
        );
        if (availableAcademicYears.length > 1) {
          return res.status(409).json({
            message:
              "Multiple students found across academic years. Provide academic_year.",
            available_academic_years: availableAcademicYears,
          });
        }
      }
    }

    if (resolvedStudents.length > 1) {
      return res.status(409).json({
        message: "Multiple students found for the same class and roll. Provide section.",
      });
    }

    const student = resolvedStudents[0];

    if (!student) {
      return res.status(404).json({
        message: "Student not found",
      });
    }

    const { classSubjects, csError } = await fetchClassSubjectsWithFallback(
      cls,
      section
    );

    if (csError) {
      console.error("Error fetching class subjects:", csError);
      return res.status(500).json({
        message: "Failed to fetch subjects for this class",
        error: csError.message,
      });
    }

    if (!classSubjects || classSubjects.length === 0) {
      return res.status(404).json({
        message: `No subjects found for class "${cls}"${section ? ` section "${section}"` : ""}`,
        note: section
          ? "Make sure subjects are added to this section using POST /api/subjects/add"
          : "Make sure subjects are added to this class using POST /api/subjects/add",
      });
    }

    const normalizedSubjects = classSubjects.filter((cs) => cs?.subjects?.id);
    if (!normalizedSubjects.length) {
      return res.status(404).json({
        message: `No valid subjects found for class "${cls}"`,
      });
    }

    const subjectIds = normalizedSubjects
      .map((cs) => cs.subject_id || cs.subjects?.id)
      .filter(Boolean);

    const { data: marksData, error: marksError } = await supabase
      .from("marks")
      .select("*")
      .eq("student_id", student.id)
      .in("subject_id", subjectIds);

    if (marksError) {
      return res.status(500).json({ message: marksError.message });
    }

    const rowTimestamp = (row) => {
      const source = row?.updated_at || row?.created_at || row?.calculated_at;
      if (!source) return 0;
      const ts = new Date(source).getTime();
      return Number.isFinite(ts) ? ts : 0;
    };

    const terminalRowMap = {
      First: new Map(),
      Second: new Map(),
      Third: new Map(),
      Annual: new Map(),
    };

    (marksData || []).forEach((row) => {
      const canonicalTerminal = normalizeStoredTerminal(row?.terminal || row?.term);
      if (!canonicalTerminal || !terminalRowMap[canonicalTerminal]) return;

      const subjectId = row.subject_id;
      if (!subjectId) return;

      const termMap = terminalRowMap[canonicalTerminal];
      const existing = termMap.get(subjectId);
      if (!existing || rowTimestamp(row) >= rowTimestamp(existing)) {
        termMap.set(subjectId, row);
      }
    });

    const parseMarkValue = (value) => {
      if (value === null || value === undefined || value === "") {
        return { isNumeric: false, numeric: 0, display: "AB" };
      }

      if (typeof value === "number" && Number.isFinite(value)) {
        return { isNumeric: true, numeric: value, display: value };
      }

      const raw = String(value).trim();
      if (!raw) return { isNumeric: false, numeric: 0, display: "AB" };

      const upper = raw.toUpperCase();
      if (upper === "AB" || upper === "NA" || upper === "N/A" || upper === "ABSENT") {
        return { isNumeric: false, numeric: 0, display: upper === "ABSENT" ? "AB" : upper };
      }

      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return { isNumeric: true, numeric: parsed, display: parsed };
      }

      return { isNumeric: false, numeric: 0, display: raw };
    };

    const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
    const divisionFromPercentage = (percentage) => {
      if (percentage >= 60) return "First";
      if (percentage >= 45) return "Second";
      if (percentage >= 33) return "Third";
      return "Fail";
    };

    const buildSingleTermSummary = (terminalName) => {
      let totalMaxMarks = 0;
      let totalObtained = 0;

      normalizedSubjects.forEach((cs) => {
        const subject = cs.subjects;
        const subjectId = cs.subject_id || subject?.id;
        if (!subject || !subjectId) return;

        totalMaxMarks += getSubjectMaxMarks(subject);

        const row = terminalRowMap[terminalName].get(subjectId);
        if (!row) return;

        const external = parseMarkValue(row.external_marks);
        const internal = parseMarkValue(row.internal_marks);
        totalObtained += external.numeric + internal.numeric;
      });

      const percentage =
        totalMaxMarks > 0 ? round2((totalObtained / totalMaxMarks) * 100) : 0;

      return {
        total_max_marks: round2(totalMaxMarks),
        total_obtained: round2(totalObtained),
        percentage,
        division: divisionFromPercentage(percentage),
        rank: null,
        status: totalObtained > 0 ? "Pending" : "Pending",
        published_date: null,
      };
    };

    const firstTermOnly = buildSingleTermSummary("First");
    const secondTermOnly = buildSingleTermSummary("Second");
    const thirdTermOnly = buildSingleTermSummary("Third");
    const annualTermOnly = buildSingleTermSummary("Annual");

    const summaryByColumn = {
      First: { ...firstTermOnly },
      Second: { ...secondTermOnly },
      Third: { ...thirdTermOnly },
      Annual: { ...annualTermOnly },
    };

    const termLabelToKey = {
      First: "first_term",
      Second: "second_term",
      Third: "third_term",
      Annual: "annual_term",
    };
    if (RESULT_TERMINAL_LABELS.length) {
      const { data: publishedRows, error: publishedError } = await supabase
        .from("result_summary")
        .select("terminal, status, rank, calculated_at")
        .eq("student_id", student.id);

      if (publishedError) {
        return res.status(500).json({
          message: "Failed to fetch published summary",
          error: publishedError.message,
        });
      }

      const publishedMap = new Map();
      (publishedRows || []).forEach((row) => {
        const normalizedLabel = normalizeResultTerminalLabel(row.terminal);
        if (!normalizedLabel) return;

        const existing = publishedMap.get(normalizedLabel);
        const existingTs = existing?.calculated_at
          ? new Date(existing.calculated_at).getTime()
          : 0;
        const nextTs = row?.calculated_at
          ? new Date(row.calculated_at).getTime()
          : 0;

        if (!existing || nextTs >= existingTs) {
          publishedMap.set(normalizedLabel, row);
        }
      });

      RESULT_TERMINAL_LABELS.forEach((label) => {
        const row = publishedMap.get(label);
        if (!row) return;

        summaryByColumn[label] = {
          ...summaryByColumn[label],
          rank: row.rank ?? null,
          status: row.status || summaryByColumn[label].status,
          published_date: row.calculated_at
            ? new Date(row.calculated_at).toISOString().split("T")[0]
            : null,
        };
      });

      // If annual publish row is absent, reuse Third metadata for annual view.
      if (!publishedMap.has("Annual")) {
        const thirdRow = publishedMap.get("Third");
        if (thirdRow) {
          summaryByColumn.Annual = {
            ...summaryByColumn.Annual,
            rank: thirdRow.rank ?? null,
            status: thirdRow.status || summaryByColumn.Annual.status,
            published_date: thirdRow.calculated_at
              ? new Date(thirdRow.calculated_at).toISOString().split("T")[0]
              : null,
          };
        }
      }
    }

    const buildScopedMetric = (selector, scopedTermLabels) => {
      const metric = {};
      scopedTermLabels.forEach((label) => {
        const key = termLabelToKey[label];
        metric[key] = selector(summaryByColumn[label]);
      });
      return metric;
    };

    const buildScopedTermLabels = (terminalLabel) => {
      if (terminalLabel === "First") return ["First"];
      if (terminalLabel === "Second") return ["First", "Second"];
      if (terminalLabel === "Annual") return ["First", "Second", "Third", "Annual"];
      return ["First", "Second", "Third"];
    };

    const buildMarksDetailsForTerminal = (terminalLabel) => {
      const selectedMarksMap = terminalRowMap[terminalLabel] || new Map();

      return normalizedSubjects
        .map((cs) => {
          const subject = cs.subjects;
          const subjectId = cs.subject_id || subject?.id;
          if (!subject || !subjectId) return null;

          const maxMarks = getSubjectMaxMarks(subject);
          const row = selectedMarksMap.get(subjectId);
          const external = parseMarkValue(row?.external_marks);
          const internal = parseMarkValue(row?.internal_marks);
          const subjectTotal = round2(external.numeric + internal.numeric);

          return {
            subject: subject.name,
            code: subject.code,
            max_marks: maxMarks,
            external_marks: external.display,
            internal_marks: internal.display,
            total_obtained: subjectTotal > 0 ? subjectTotal : "AB",
          };
        })
        .filter(Boolean);
    };

    const buildResponsePayloadForTerminal = (terminalLabel) => {
      const scopedTermLabels = buildScopedTermLabels(terminalLabel);
      const selectedSummaryLabel =
        terminalLabel === "Annual" ? "Annual" : terminalLabel;

      const summaryReport = {
        total_marks: buildScopedMetric((row) => row.total_max_marks, scopedTermLabels),
        marks_obtained: buildScopedMetric((row) => row.total_obtained, scopedTermLabels),
        percentage: buildScopedMetric((row) => row.percentage, scopedTermLabels),
        division: buildScopedMetric((row) => row.division, scopedTermLabels),
        rank: buildScopedMetric((row) => row.rank, scopedTermLabels),
        published_date: buildScopedMetric((row) => row.published_date, scopedTermLabels),
      };

      const terminals = scopedTermLabels.map((label) => ({
        terminal: label,
        summary: summaryByColumn[label],
      }));

      return {
        student: {
          id: student.id,
          name: student.name,
          father_name: student.father_name,
          mother_name: student.mother_name || null,
          class: student.class,
          roll_no: student.roll_no,
          section: student.section,
          academic_year: student.academic_year || requestedAcademicYearRaw || null,
        },
        terminal: terminalLabel,
        resolved_terminal: terminalLabel === "Annual" ? terminalLabel : undefined,
        marks: buildMarksDetailsForTerminal(terminalLabel),
        summary: summaryByColumn[selectedSummaryLabel],
        summary_report: summaryReport,
        terminals,
      };
    };

    RESULT_TERMINAL_LABELS.forEach((terminalLabel) => {
      const cacheKey = buildResultCacheKeyForTerminal(terminalLabel);
      const payload = buildResponsePayloadForTerminal(terminalLabel);
      setCachedReadResponse(cacheKey, payload, RESULT_BY_ROLL_CACHE_TTL_MS);
    });

    const cachedOrBuiltPayload =
      getCachedReadResponse(requestedResultCacheKey) ||
      buildResponsePayloadForTerminal(requestedTerminal);

    // Keep backward behavior for clients that depend on the exact query value.
    const responsePayload = {
      ...cachedOrBuiltPayload,
      terminal: requestedTerminalRaw || cachedOrBuiltPayload.terminal,
    };

    setReadCacheHeaders({
      res,
      ttlMs: RESULT_BY_ROLL_CACHE_TTL_MS,
      cacheHit: false,
      visibility: "public",
    });

    return res.json(responsePayload);
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
    if (!className || !section || !terminal || !roll_no || !marks || !Array.isArray(marks)) {
      return res.status(400).json({
        message: "class, section, terminal, roll_no, and marks (array) are required",
      });
    }

    // Find student by class, section, and roll_no
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, name, class, section, roll_no")
      .eq("class", className)
      .eq("section", section)
      .eq("roll_no", Number(roll_no))
      .single();

    if (studentError || !student) {
      return res.status(404).json({ 
        message: "Student not found. Please check class, section, and roll number." 
      });
    }

    // Get class subjects (prefer class+section, fallback to class-level)
    const { classSubjects, csError } = await fetchClassSubjectsWithFallback(
      className,
      section
    );

    if (csError || !classSubjects?.length) {
      return res.status(404).json({ 
        message: `No subjects found for class "${className}"${section ? ` section "${section}"` : ""}`,
        note: "Add subjects to class using POST /api/subjects/add",
      });
    }

    // Create subject map
    const subjectMap = {};
    classSubjects.forEach((cs) => {
      const subject = cs.subjects;
      if (!subject?.id) return;
      const subjectDetails = {
        id: subject.id,
        name: subject.name,
        code: subject.code,
      };
      subjectMap[String(subject.name || "").toLowerCase()] = subjectDetails;
      subjectMap[String(subject.code || "").toLowerCase()] = subjectDetails;
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
      let subjectRef = null;
      if (subject_name) {
        subjectRef = subjectMap[subject_name.toLowerCase()];
      }
      if (!subjectRef && subject_code) {
        subjectRef = subjectMap[subject_code.toLowerCase()];
      }

      if (!subjectRef?.id) {
        errors.push(`Subject "${subject_name || subject_code}" not found for this class`);
        continue;
      }
      const subject_id = subjectRef.id;

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
        const normalizedMarks = validateAndNormalizeSubjectMarks({
          subject: subjectRef,
          external_marks,
          internal_marks,
        });
        if (normalizedMarks.error) {
          errors.push(normalizedMarks.error);
          continue;
        }

        // Insert new marks only
        markRecords.push({
          student_id: student.id,
          subject_id: subject_id,
          terminal,
          external_marks: normalizedMarks.external_marks,
          internal_marks: normalizedMarks.internal_marks,
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

    invalidateReadCacheByPrefix(["resultByRoll:", "marksByClass:"]);

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
    if (!className || !section || !terminal || !roll_no || !marks || !Array.isArray(marks)) {
      return res.status(400).json({
        message: "class, section, terminal, roll_no, and marks (array) are required",
      });
    }

    // Find student by class, section, and roll_no
    const { data: student, error: studentError } = await supabase
      .from("students")
      .select("id, name, class, section, roll_no")
      .eq("class", className)
      .eq("section", section)
      .eq("roll_no", Number(roll_no))
      .single();

    if (studentError || !student) {
      return res.status(404).json({ 
        message: "Student not found. Please check class, section, and roll number." 
      });
    }

    // Get class subjects (prefer class+section, fallback to class-level)
    const { classSubjects, csError } = await fetchClassSubjectsWithFallback(
      className,
      section
    );

    if (csError || !classSubjects?.length) {
      return res.status(404).json({ 
        message: `No subjects found for class "${className}"${section ? ` section "${section}"` : ""}`,
        note: "Add subjects to class using POST /api/subjects/add",
      });
    }

    // Create subject map
    const subjectMap = {};
    classSubjects.forEach((cs) => {
      const subject = cs.subjects;
      if (!subject?.id) return;
      const subjectDetails = {
        id: subject.id,
        name: subject.name,
        code: subject.code,
      };
      subjectMap[String(subject.name || "").toLowerCase()] = subjectDetails;
      subjectMap[String(subject.code || "").toLowerCase()] = subjectDetails;
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
      const subjectRef = subjectMap[subjectKey];
      const subject_id = subjectRef?.id;

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

      const normalizedMarks = validateAndNormalizeSubjectMarks({
        subject: subjectRef,
        external_marks,
        internal_marks,
      });
      if (normalizedMarks.error) {
        errors.push(normalizedMarks.error);
        continue;
      }

      // Update existing marks
      const { data: updatedMark, error: updateError } = await supabase
        .from("marks")
        .update({
          external_marks: normalizedMarks.external_marks,
          internal_marks: normalizedMarks.internal_marks,
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

    invalidateReadCacheByPrefix(["resultByRoll:", "marksByClass:"]);

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

    // Calculate total max marks based on subject maxima.
    const totalMaxMarks = classSubjects.reduce(
      (sum, cs) => sum + getSubjectMaxMarks(cs.subjects),
      0
    );

    // First pass: Calculate percentages for all students to determine ranking
    const studentResults = [];
    const errors = [];

    // Process each student to calculate their percentage
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
          ? parseFloat(((totalObtained / totalMaxMarks) * 100).toFixed(2))
          : 0;
        
        const division = 
          percentage >= 60 ? "First" 
          : percentage >= 45 ? "Second" 
          : percentage >= 33 ? "Third" 
          : "Fail";

        studentResults.push({
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

    // Sort by percentage descending to determine rank
    const sortedResults = [...studentResults].sort((a, b) => b.percentage - a.percentage);
    
    // Create rank map (only top 10 get ranks)
    const rankMap = {};
    sortedResults.forEach((result, index) => {
      if (index < 10) {
        rankMap[result.student_id] = index + 1;
      }
    });

    // Second pass: Save results with ranks
    const publishedResults = [];
    for (const result of studentResults) {
      try {
        // Lock marks
        await supabase
          .from("marks")
          .update({ status: "LOCKED" })
          .eq("student_id", result.student_id)
          .eq("terminal", terminal);

        // Save summary with rank
        const rank = rankMap[result.student_id] || null;
        await supabase
          .from("result_summary")
          .upsert(
            {
              student_id: result.student_id,
              terminal,
              total_marks: totalMaxMarks,
              total_obtained: result.total_obtained,
              percentage: result.percentage,
              division: result.division,
              rank: rank,
              status: "Published",
              calculated_at: new Date().toISOString(),
            },
            { onConflict: "student_id,terminal" }
          );

        publishedResults.push({
          student_id: result.student_id,
          name: result.name,
          roll_no: result.roll_no,
          total_obtained: result.total_obtained,
          percentage: result.percentage,
          division: result.division,
          rank: rank,
        });
      } catch (err) {
        errors.push(`Error saving result for ${result.name}: ${err.message}`);
      }
    }

    let promotion = null;
    if (shouldAutoPromote(terminal)) {
      const promotionTarget = getPromotionTarget(className);

      if (!promotionTarget) {
        errors.push(`Auto-promotion skipped: no promotion rule configured for class "${className}"`);
      } else {
        const promotedStudentIds = publishedResults.map((r) => r.student_id);

        if (promotedStudentIds.length > 0) {
          const { data: promotedRows, error: promoteError } = await supabase
            .from("students")
            .update({ class: promotionTarget.nextClass })
            .in("id", promotedStudentIds)
            .select("id");

          if (promoteError) {
            errors.push(`Auto-promotion failed for class "${className}": ${promoteError.message}`);
          } else {
            promotion = {
              from_class: className,
              to_class: promotionTarget.nextClass,
              passed_out: promotionTarget.passedOut,
              promoted_students: promotedRows?.length || promotedStudentIds.length,
            };

            if (promotionTarget.passedOut) {
              const { data: statusRows, error: statusError } = await supabase
                .from("students")
                .update({ status: PASSED_OUT_STATUS })
                .in("id", promotedStudentIds)
                .select("id");

              if (statusError) {
                if (isMissingColumnError(statusError, "status")) {
                  promotion.status_update = "skipped (students table has no status column)";
                } else {
                  errors.push(`Passed-out status update failed: ${statusError.message}`);
                }
              } else {
                promotion.status_updated = statusRows?.length || promotedStudentIds.length;
              }
            }
          }
        }
      }
    }

    invalidateReadCacheByPrefix(["resultByRoll:", "marksByClass:"]);

    res.json({
      success: true,
      message: `Results published for ${publishedResults.length} student(s)`,
      class: className,
      section: section || "All",
      terminal,
      published: publishedResults.length,
      total_students: students.length,
      promotion: promotion || undefined,
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
    const requestedTerminalRaw = String(terminal || "").trim();

    if (!className || !requestedTerminalRaw) {
      return res.status(400).json({
        message: "class and terminal are required",
      });
    }

    const requestedTerminal =
      normalizeResultTerminalLabel(requestedTerminalRaw) || requestedTerminalRaw;
    const marksCacheBaseKey = buildReadCacheKey("marksByClass", {
      class: className,
      section,
    });
    const buildMarksCacheKeyForTerminal = (terminalLabel) =>
      `${marksCacheBaseKey}&terminal=${terminalLabel}`;
    const marksCacheKey = buildMarksCacheKeyForTerminal(requestedTerminal);

    const cachedMarksPayload = getCachedReadResponse(marksCacheKey);
    if (cachedMarksPayload) {
      setReadCacheHeaders({
        res,
        ttlMs: MARKS_BY_CLASS_CACHE_TTL_MS,
        cacheHit: true,
        visibility: "private",
      });
      return res.json(cachedMarksPayload);
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
    const fetchAllKnownTerminals = Boolean(
      normalizeResultTerminalLabel(requestedTerminalRaw)
    );
    const terminalsToFetch = fetchAllKnownTerminals
      ? RESULT_TERMINAL_LABELS
      : [requestedTerminal];

    // Get all marks for these students
    const { data: marksData, error: marksError } = await supabase
      .from("marks")
      .select("*")
      .in("student_id", studentIds)
      .in("terminal", terminalsToFetch)
      .in("subject_id", subjectIds);

    if (marksError) {
      return res.status(500).json({ 
        message: "Failed to fetch marks",
        error: marksError.message 
      });
    }

    // Organize marks by terminal then by student
    const marksByTerminalAndStudent = {};
    marksData?.forEach((m) => {
      const terminalLabel =
        normalizeResultTerminalLabel(m.terminal) || String(m.terminal || "").trim();
      if (!terminalLabel) return;

      if (!marksByTerminalAndStudent[terminalLabel]) {
        marksByTerminalAndStudent[terminalLabel] = {};
      }

      if (!marksByTerminalAndStudent[terminalLabel][m.student_id]) {
        marksByTerminalAndStudent[terminalLabel][m.student_id] = {};
      }
      marksByTerminalAndStudent[terminalLabel][m.student_id][m.subject_id] = {
        external_marks: m.external_marks,
        internal_marks: m.internal_marks,
        status: m.status,
      };
    });

    const buildTerminalPayload = (terminalLabel) => {
      const marksByStudent = marksByTerminalAndStudent[terminalLabel] || {};

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

      return {
        success: true,
        class: className,
        section: section || "All",
        terminal: terminalLabel,
        students: studentsWithMarks,
        count: studentsWithMarks.length,
      };
    };

    const terminalsToCache = fetchAllKnownTerminals
      ? RESULT_TERMINAL_LABELS
      : [requestedTerminal];

    terminalsToCache.forEach((terminalLabel) => {
      const payload = buildTerminalPayload(terminalLabel);
      const cacheKey = buildMarksCacheKeyForTerminal(terminalLabel);
      setCachedReadResponse(cacheKey, payload, MARKS_BY_CLASS_CACHE_TTL_MS);
    });

    const cachedOrBuiltPayload =
      getCachedReadResponse(marksCacheKey) || buildTerminalPayload(requestedTerminal);

    // Keep backward behavior for clients that depend on the exact query value.
    const responsePayload = {
      ...cachedOrBuiltPayload,
      terminal: requestedTerminalRaw || cachedOrBuiltPayload.terminal,
    };

    setReadCacheHeaders({
      res,
      ttlMs: MARKS_BY_CLASS_CACHE_TTL_MS,
      cacheHit: false,
      visibility: "private",
    });

    return res.json(responsePayload);
  } catch (err) {
    console.error("Get marks error:", err);
    res.status(500).json({ 
      message: "Server error",
      error: err.message 
    });
  }
};

