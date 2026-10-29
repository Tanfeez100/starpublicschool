import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { supabase } from "../services/supabase.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data");
const FALLBACK_FILE = path.join(DATA_DIR, "document_templates.json");

// Ensure data directory exists for persistent backup
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error("Could not create data dir:", err);
  }
}

// Default system templates and configuration
export const DEFAULT_DOCUMENT_CONFIG = {
  id_card: {
    category: "id_card",
    activeTemplateId: "id_card_modern_blue",
    customization: {
      schoolName: "STAR PUBLIC SCHOOL",
      tagline: "Meghwal mathia Bazar, West Champaran, Bihar - 845106",
      address: "Meghwal mathia Bazar, West Champaran, Bihar 845106",
      phone: "+91 9006457330",
      email: "a9006457330@gmail.com",
      primaryColor: "#071d3f",
      secondaryColor: "#d4af37",
      accentColor: "#2563eb",
      fontFamily: "Inter, sans-serif",
      showQr: true,
      showCutLines: true,
      principalSignLabel: "Principal Sign",
      validTill: "31/03/2027",
      academicYear: "2026-2027",
    },
    updatedAt: new Date().toISOString(),
  },
  admit_card: {
    category: "admit_card",
    activeTemplateId: "admit_card_modern_blue",
    customization: {
      schoolName: "STAR PUBLIC SCHOOL",
      tagline: "Meghwal mathia Bazar, West Champaran, Bihar - 845106",
      examName: "ANNUAL EXAMINATION 2026-27",
      session: "2026-2027",
      centerName: "Star Public School Campus - Examination Hall",
      reportingTime: "08:30 AM",
      primaryColor: "#0f2b5c",
      secondaryColor: "#1e3a8a",
      accentColor: "#2563eb",
      fontFamily: "Inter, sans-serif",
      showTimetable: true,
      showInstructions: true,
      controllerSignLabel: "Controller of Examinations",
      principalSignLabel: "Principal Signature",
      instructions: [
        "Candidates must occupy their seats 15 minutes before exam commencement.",
        "Admit Card & Student Identity Card are mandatory for hall entry.",
        "Electronic gadgets, smartwatches, and study notes are strictly forbidden.",
        "Write your Roll Number & Admission Number legibly on the answer booklet.",
      ],
    },
    updatedAt: new Date().toISOString(),
  },
  transfer_certificate: {
    category: "transfer_certificate",
    activeTemplateId: "tc_traditional_official",
    customization: {
      schoolName: "STAR PUBLIC SCHOOL",
      tagline: "Senior Secondary School | Meghwal mathia Bazar, West Champaran",
      affiliationNo: "SPS/BIH/2018/094",
      schoolCode: "845106",
      bookNo: "04",
      prefixNo: "TC/2026/",
      primaryColor: "#1e293b",
      secondaryColor: "#991b1b",
      accentColor: "#d97706",
      fontFamily: "serif",
      showSeal: true,
      showWatermark: true,
      preparedByLabel: "Office Clerk",
      verifiedByLabel: "Checked By (Incharge)",
      principalSignLabel: "Principal (with School Seal)",
    },
    updatedAt: new Date().toISOString(),
  },
  marksheet: {
    category: "marksheet",
    activeTemplateId: "marksheet_official_star_public",
    customization: {
      boardName: "BIHAR SCHOOL EXAMINATION BOARD / ACADEMIC COUNCIL",
      schoolName: "STAR PUBLIC SCHOOL",
      tagline: "Meghwal mathia Bazar, West Champaran, Bihar - 845106",
      session: "2026-2027",
      examName: "FIRST TERMINAL EXAMINATION RESULT - 2026",
      schoolAddress: "MAIN ROAD MATHIA BAZAR, MEGHWAL",
      examTitle: "FIRST TERMINAL EXAMINATION RESULT - 2026",
      termHeader: "First Term",
      primaryColor: "#0f172a",
      secondaryColor: "#1e40af",
      accentColor: "#b45309",
      fontFamily: "Inter, sans-serif",
      showGradingScale: true,
      showRemarks: true,
      showRank: true,
      showAttendance: true,
      classTeacherSignLabel: "Class Teacher",
      inchargeSignLabel: "Examination Controller",
      principalSignLabel: "Principal's Signature & Seal",
    },
    updatedAt: new Date().toISOString(),
  },
};

// Helper to read local fallback
function readLocalStore() {
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const data = fs.readFileSync(FALLBACK_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error reading local document templates fallback:", err);
  }
  return { ...DEFAULT_DOCUMENT_CONFIG };
}

// Helper to write local fallback
function writeLocalStore(config) {
  try {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing local document templates fallback:", err);
  }
}

/**
 * GET /api/document-templates
 * Returns the currently active template and customization for all 4 categories.
 */
export async function getDocumentTemplates(req, res) {
  try {
    // 1. Attempt to fetch from Supabase
    const { data, error } = await supabase
      .from("document_templates")
      .select("*");

    if (!error && data && data.length > 0) {
      const formatted = { ...DEFAULT_DOCUMENT_CONFIG };
      data.forEach((row) => {
        if (row.category && formatted[row.category]) {
          formatted[row.category] = {
            category: row.category,
            activeTemplateId: row.active_template_id,
            customization: {
              ...DEFAULT_DOCUMENT_CONFIG[row.category].customization,
              ...(row.customization || {}),
            },
            updatedAt: row.updated_at,
            updatedBy: row.updated_by,
          };
        }
      });
      // Synchronize to local backup
      writeLocalStore(formatted);
      return res.status(200).json({
        success: true,
        source: "database",
        data: formatted,
      });
    }

    // 2. Fallback to persistent local storage
    const localData = readLocalStore();
    return res.status(200).json({
      success: true,
      source: "local_persistent",
      data: localData,
    });
  } catch (err) {
    console.error("Error in getDocumentTemplates:", err);
    return res.status(200).json({
      success: true,
      source: "defaults",
      data: readLocalStore(),
    });
  }
}

/**
 * POST /api/document-templates/select
 * Selects the active template for a document category.
 * Body: { category: string, templateId: string }
 */
export async function selectActiveTemplate(req, res) {
  try {
    const { category, templateId } = req.body;

    if (!category || !templateId) {
      return res.status(400).json({
        success: false,
        message: "category and templateId are required",
      });
    }

    if (!DEFAULT_DOCUMENT_CONFIG[category]) {
      return res.status(400).json({
        success: false,
        message: `Invalid document category '${category}'`,
      });
    }

    const currentLocal = readLocalStore();
    const existing = currentLocal[category] || DEFAULT_DOCUMENT_CONFIG[category];

    const updatedConfig = {
      ...existing,
      activeTemplateId: templateId,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.username || req.user?.email || "admin",
    };

    currentLocal[category] = updatedConfig;
    writeLocalStore(currentLocal);

    // Persist to Supabase if table is available
    try {
      await supabase.from("document_templates").upsert(
        {
          category,
          active_template_id: templateId,
          customization: updatedConfig.customization,
          updated_at: new Date().toISOString(),
          updated_by: updatedConfig.updatedBy,
          school_id: "default_school",
        },
        { onConflict: "category,school_id" }
      );
    } catch (dbErr) {
      console.warn("Supabase upsert skipped (table might not exist yet):", dbErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Active template for '${category}' updated to '${templateId}'`,
      data: updatedConfig,
    });
  } catch (err) {
    console.error("Error in selectActiveTemplate:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to update active template",
    });
  }
}

/**
 * POST /api/document-templates/customize
 * Customizes settings (colors, logo, signatures, headers) for a document category.
 * Body: { category: string, customization: object }
 */
export async function customizeTemplate(req, res) {
  try {
    const { category, customization } = req.body;

    if (!category || !customization || typeof customization !== "object") {
      return res.status(400).json({
        success: false,
        message: "category and customization object are required",
      });
    }

    if (!DEFAULT_DOCUMENT_CONFIG[category]) {
      return res.status(400).json({
        success: false,
        message: `Invalid document category '${category}'`,
      });
    }

    const currentLocal = readLocalStore();
    const existing = currentLocal[category] || DEFAULT_DOCUMENT_CONFIG[category];

    const mergedCustomization = {
      ...(existing.customization || {}),
      ...customization,
    };

    const updatedConfig = {
      ...existing,
      customization: mergedCustomization,
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.username || req.user?.email || "admin",
    };

    currentLocal[category] = updatedConfig;
    writeLocalStore(currentLocal);

    // Persist to Supabase if table is available
    try {
      await supabase.from("document_templates").upsert(
        {
          category,
          active_template_id: updatedConfig.activeTemplateId,
          customization: mergedCustomization,
          updated_at: new Date().toISOString(),
          updated_by: updatedConfig.updatedBy,
          school_id: "default_school",
        },
        { onConflict: "category,school_id" }
      );
    } catch (dbErr) {
      console.warn("Supabase customize upsert skipped:", dbErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Customization for '${category}' saved successfully`,
      data: updatedConfig,
    });
  } catch (err) {
    console.error("Error in customizeTemplate:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to save customization",
    });
  }
}

/**
 * POST /api/document-templates/reset
 * Resets a document category's customization and active template back to factory default.
 * Body: { category: string }
 */
export async function resetTemplateDefaults(req, res) {
  try {
    const { category } = req.body;

    if (!category || !DEFAULT_DOCUMENT_CONFIG[category]) {
      return res.status(400).json({
        success: false,
        message: "Valid category is required to reset",
      });
    }

    const currentLocal = readLocalStore();
    const defaultConfig = {
      ...DEFAULT_DOCUMENT_CONFIG[category],
      updatedAt: new Date().toISOString(),
      updatedBy: req.user?.username || "admin",
    };

    currentLocal[category] = defaultConfig;
    writeLocalStore(currentLocal);

    try {
      await supabase.from("document_templates").upsert(
        {
          category,
          active_template_id: defaultConfig.activeTemplateId,
          customization: defaultConfig.customization,
          updated_at: new Date().toISOString(),
          updated_by: defaultConfig.updatedBy,
          school_id: "default_school",
        },
        { onConflict: "category,school_id" }
      );
    } catch (dbErr) {
      console.warn("Supabase reset upsert skipped:", dbErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Reset '${category}' to default template and styling`,
      data: defaultConfig,
    });
  } catch (err) {
    console.error("Error in resetTemplateDefaults:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to reset template",
    });
  }
}
