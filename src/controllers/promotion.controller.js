import { supabase } from "../services/supabase.js";

const toTrimmed = (value) => String(value ?? "").trim();

const classifyPromotionError = (errorMessage) => {
  const message = String(errorMessage || "");
  if (message.toLowerCase().includes("duplicate key")) return 409;
  if (message.includes("chk_students_left_date_consistency")) return 400;
  if (message.includes("PROMOTION_CONFLICT:")) return 409;
  if (message.includes("NOT_FOUND:")) return 404;
  if (message.includes("VALIDATION_ERROR:")) return 400;
  if (message.includes("SCHEMA_ERROR:")) return 500;
  return 500;
};

const cleanPromotionErrorMessage = (errorMessage) =>
  (() => {
    const rawMessage = String(errorMessage || "");

    if (/uq_students_roll_active_per_(year|session)/i.test(rawMessage)) {
      const detailMatch = rawMessage.match(
        /Key \(([^)]+)\)=\(([^)]+)\) already exists\./i
      );
      const detail = detailMatch?.[2] ? ` (${detailMatch[2]})` : "";
      return `target class+section+roll already in use${detail}`;
    }

    return rawMessage
      .replace(/^ERROR:\s*/i, "")
      .replace(
        /^(PROMOTION_CONFLICT|NOT_FOUND|VALIDATION_ERROR|SCHEMA_ERROR):\s*/i,
        ""
      )
      .replace(
        /new row for relation "students" violates check constraint "chk_students_left_date_consistency"/i,
        "students.left_date consistency failed for status transition"
      )
      .trim();
  })();

export const promoteClass = async (req, res) => {
  try {
    const fromClass = toTrimmed(req.body?.from_class);
    const currentSession = toTrimmed(req.body?.current_session);
    const newSession = toTrimmed(req.body?.new_session);
    const promotedBy = toTrimmed(req.body?.promoted_by);

    if (!fromClass || !currentSession || !newSession || !promotedBy) {
      return res.status(400).json({
        message:
          "from_class, current_session, new_session, and promoted_by are required",
      });
    }

    if (currentSession === newSession) {
      return res.status(400).json({
        message: "current_session and new_session must be different",
      });
    }

    const { data, error } = await supabase.rpc("promote_class_students", {
      p_from_class: fromClass,
      p_current_session: currentSession,
      p_new_session: newSession,
      p_promoted_by: promotedBy,
    });

    if (error) {
      const statusCode = classifyPromotionError(error.message);
      return res.status(statusCode).json({
        message: cleanPromotionErrorMessage(error.message) || "Promotion failed",
        error: error.message,
      });
    }

    const result = typeof data === "string" ? JSON.parse(data) : data;

    if (!result || result.success !== true) {
      return res.status(500).json({
        message: "Promotion completed with unexpected response",
      });
    }

    return res.json({
      success: true,
      promoted_count: Number(result.promoted_count || 0),
      message: result.message || "Class promoted successfully",
    });
  } catch (error) {
    console.error("Promote class error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
