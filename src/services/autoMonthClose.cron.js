import cron from "node-cron";
import { executeMonthClosure } from "../controllers/fees.controller.js";

/**
 * Check if a given Date object represents the last day of its month in IST
 * @param {Date} date
 * @returns {boolean}
 */
export const isLastDayOfMonthIST = (date = new Date()) => {
  // Convert date to IST representation
  const istString = date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const istDate = new Date(istString);

  // Check tomorrow in IST
  const tomorrow = new Date(istDate);
  tomorrow.setDate(istDate.getDate() + 1);

  // If tomorrow is day 1, today is the last day of the month
  return tomorrow.getDate() === 1;
};

/**
 * Get current year and month formatted as YYYY-MM in Asia/Kolkata timezone
 * @param {Date} date
 * @returns {string} e.g. "2026-10"
 */
export const getCurrentMonthIST = (date = new Date()) => {
  const istString = date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  const istDate = new Date(istString);
  const yyyy = istDate.getFullYear();
  const mm = String(istDate.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
};

/**
 * Perform the month-close check and execution
 * @param {boolean} force - If true, closes current month even if today is not the last day
 */
export const runAutoMonthCloseJob = async (force = false) => {
  const now = new Date();
  const monthStr = getCurrentMonthIST(now);
  const isLastDay = isLastDayOfMonthIST(now);

  console.log(`[AutoMonthClose] 🕒 Cron triggered at ${now.toISOString()} | Month: ${monthStr} | isLastDay: ${isLastDay} | force: ${force}`);

  if (!isLastDay && !force) {
    console.log(`[AutoMonthClose] ℹ️ Today is not the last day of the month in IST. No closure needed.`);
    return { executed: false, reason: "NOT_LAST_DAY", month: monthStr };
  }

  try {
    console.log(`[AutoMonthClose] 🚀 Executing automated month closure for ${monthStr}...`);
    const result = await executeMonthClosure(monthStr, null);

    if (result.alreadyClosed) {
      console.log(`[AutoMonthClose] ℹ️ Month ${monthStr} was already closed. Nothing to process.`);
      return { executed: false, reason: "ALREADY_CLOSED", month: monthStr, result };
    }

    console.log(`[AutoMonthClose] ✅ Successfully closed month ${monthStr}! Dues created: ${result.createdDues}, Bills updated: ${result.updatedBills}`);
    return { executed: true, month: monthStr, result };
  } catch (err) {
    console.error(`[AutoMonthClose] ❌ Error executing automated month closure:`, err);
    return { executed: false, error: err.message, month: monthStr };
  }
};

let scheduledTask = null;

/**
 * Initialize the Auto-Close Month CRON scheduler.
 * Runs every day at 18:00 (6:00 PM) IST.
 * If today is the last day of the month, closes the month and rolls over unpaid dues.
 */
export const initAutoMonthCloseCron = () => {
  if (scheduledTask) {
    console.log(`[AutoMonthClose] Cron is already initialized.`);
    return scheduledTask;
  }

  // Schedule pattern: At 18:00 (6:00 PM) every day
  // '0 18 * * *'
  const CRON_PATTERN = "0 18 * * *";

  scheduledTask = cron.schedule(
    CRON_PATTERN,
    async () => {
      console.log(`[AutoMonthClose] ⏰ 6:00 PM IST Daily Check Triggered`);
      await runAutoMonthCloseJob(false);
    },
    {
      scheduled: true,
      timezone: "Asia/Kolkata",
    }
  );

  console.log(`[AutoMonthClose] 🚀 Auto Month Close Scheduler started: Runs at 6:00 PM IST on the last day of every month.`);
  return scheduledTask;
};

/**
 * Get scheduler metadata
 */
export const getAutoCloseCronStatus = () => {
  const now = new Date();
  return {
    active: !!scheduledTask,
    schedule: "0 18 * * *",
    time: "6:00 PM IST (18:00)",
    frequency: "Daily check, closes month on the last calendar day of each month",
    timezone: "Asia/Kolkata",
    currentISTMonth: getCurrentMonthIST(now),
    isTodayLastDay: isLastDayOfMonthIST(now),
  };
};
