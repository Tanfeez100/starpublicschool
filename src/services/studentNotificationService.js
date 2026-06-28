import { supabase } from "./supabase.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const toSafeString = (value) => String(value ?? "").trim();

const isExpoPushToken = (value) => /^ExponentPushToken\[[^\]]+\]$/.test(toSafeString(value));

const chunkArray = (items = [], size = 100) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const normalizePayloadData = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
};

const buildBillPaymentsQuery = (billIds, columns) =>
  supabase
    .from("fee_payments")
    .select(columns)
    .in("bill_id", billIds);

export const fetchBillPaymentsByBillIds = async (billIds = []) => {
  const ids = (billIds || []).map((value) => toSafeString(value)).filter(Boolean);
  if (!ids.length) return [];

  const richColumns = "bill_id, amount_paid, payment_mode, payment_date, transaction_id, receipt_no, created_at";
  const basicColumns = "bill_id, amount_paid, payment_mode, payment_date, created_at";

  const { data: richData, error: richError } = await buildBillPaymentsQuery(ids, richColumns);
  if (!richError) {
    return richData || [];
  }

  const { data: basicData, error: basicError } = await buildBillPaymentsQuery(ids, basicColumns);
  if (basicError) {
    throw basicError;
  }

  return (basicData || []).map((payment) => ({
    ...payment,
    transaction_id: null,
    receipt_no: null,
  }));
};

const selectNotificationColumns = `
  id,
  student_id,
  title,
  body,
  notification_type,
  source_type,
  source_id,
  notification_data,
  delivery_status,
  is_read,
  read_at,
  sent_at,
  created_at,
  updated_at
`;

export const loadBillNotificationContext = async (billId) => {
  const id = toSafeString(billId);
  if (!id) {
    throw new Error("billId is required");
  }

  const { data: bill, error: billError } = await supabase
    .from("fee_bills")
    .select(
      `
      *,
      students (
        id,
        name,
        father_name,
        roll_no,
        class,
        section,
        mobile,
        username,
        date_of_birth
      )
    `
    )
    .eq("id", id)
    .single();

  if (billError || !bill) {
    throw billError || new Error("Bill not found");
  }

  const [
    { data: items, error: itemsError },
    { data: advanceUsedRows, error: advanceError },
    { data: activeAdvanceRows, error: activeAdvanceError },
  ] = await Promise.all([
    supabase
      .from("fee_bill_items")
      .select("fee_name, amount")
      .eq("bill_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("advance_ledger")
      .select("amount")
      .eq("used_for_bill_id", id)
      .eq("status", "used"),
    supabase
      .from("advance_ledger")
      .select("amount")
      .eq("student_id", bill.student_id)
      .eq("status", "active"),
  ]);

  if (itemsError || advanceError || activeAdvanceError) {
    throw itemsError || advanceError || activeAdvanceError;
  }

  const payments = await fetchBillPaymentsByBillIds([id]);

  const totalPaid = payments?.reduce((sum, payment) => sum + Number.parseFloat(payment.amount_paid || 0), 0) || 0;
  const advanceUsed = advanceUsedRows?.reduce((sum, row) => sum + Number.parseFloat(row.amount || 0), 0) || 0;
  const activeAdvanceBalance = activeAdvanceRows?.reduce((sum, row) => sum + Number.parseFloat(row.amount || 0), 0) || 0;
  const totalAmount = Number.parseFloat(bill.total_amount || 0);
  const totalPaidIncludingAdvance = totalPaid + advanceUsed;
  const remaining = Math.max(0, totalAmount - totalPaidIncludingAdvance);

  return {
    bill_id: bill.id,
    invoice_number: `INV-${bill.id.substring(0, 8).toUpperCase()}`,
    month: bill.month,
    date: bill.created_at,
    student: bill.students,
    items: items || [],
    payments: payments || [],
    summary: {
      total_amount: totalAmount,
      total_paid: totalPaid,
      advance_used: advanceUsed,
      total_paid_including_advance: totalPaidIncludingAdvance,
      remaining,
      active_advance_balance: activeAdvanceBalance,
      status: remaining === 0 ? "paid" : totalPaidIncludingAdvance > 0 ? "partial" : "unpaid",
      bill_status: bill.bill_status || "unpaid",
      receipt_number: bill.receipt_number || null,
      net_payable: Number.parseFloat(bill.net_payable || remaining || 0),
    },
  };
};

export const registerStudentPushToken = async ({
  studentId,
  pushToken,
  platform = null,
  deviceId = null,
}) => {
  const student_id = toSafeString(studentId);
  const token = toSafeString(pushToken);

  if (!student_id || !token) {
    throw new Error("studentId and pushToken are required");
  }

  if (!isExpoPushToken(token)) {
    throw new Error("Invalid Expo push token");
  }

  const payload = {
    student_id,
    push_token: token,
    platform: toSafeString(platform) || null,
    device_id: toSafeString(deviceId) || null,
    is_active: true,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("student_push_tokens")
    .upsert(payload, { onConflict: "push_token" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const listStudentPushTokens = async (studentId) => {
  const student_id = toSafeString(studentId);
  if (!student_id) return [];

  const { data, error } = await supabase
    .from("student_push_tokens")
    .select("id, push_token, platform, device_id, is_active, last_seen_at")
    .eq("student_id", student_id)
    .eq("is_active", true)
    .order("last_seen_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
};

export const storeStudentNotification = async ({
  studentId,
  title,
  body,
  notificationType = "general",
  sourceType = null,
  sourceId = null,
  data = {},
  deliveryStatus = "queued",
}) => {
  const student_id = toSafeString(studentId);
  if (!student_id) {
    throw new Error("studentId is required");
  }

  const payload = {
    student_id,
    title: toSafeString(title),
    body: toSafeString(body),
    notification_type: toSafeString(notificationType) || "general",
    source_type: toSafeString(sourceType) || null,
    source_id: sourceId || null,
    notification_data: normalizePayloadData(data),
    delivery_status: toSafeString(deliveryStatus) || "queued",
    is_read: false,
    read_at: null,
    sent_at: deliveryStatus === "sent" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await supabase
    .from("student_notifications")
    .insert(payload)
    .select(selectNotificationColumns)
    .single();

  if (error) {
    throw error;
  }

  return inserted;
};

export const updateStudentNotification = async (notificationId, patch = {}) => {
  const id = toSafeString(notificationId);
  if (!id) {
    throw new Error("notificationId is required");
  }

  const updatePayload = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("student_notifications")
    .update(updatePayload)
    .eq("id", id)
    .select(selectNotificationColumns)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

export const listStudentNotifications = async ({ studentId, limit = 25, offset = 0 } = {}) => {
  const student_id = toSafeString(studentId);
  if (!student_id) return [];

  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const { data, error } = await supabase
    .from("student_notifications")
    .select(selectNotificationColumns)
    .eq("student_id", student_id)
    .order("created_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit);

  if (error) {
    throw error;
  }

  const rows = data || [];
  const hasMore = rows.length > safeLimit;

  return {
    notifications: hasMore ? rows.slice(0, safeLimit) : rows,
    hasMore,
  };
};

export const countStudentUnreadNotifications = async (studentId) => {
  const student_id = toSafeString(studentId);
  if (!student_id) return 0;

  const { count, error } = await supabase
    .from("student_notifications")
    .select("id", { count: "exact", head: true })
    .eq("student_id", student_id)
    .eq("is_read", false);

  if (error) {
    throw error;
  }

  return count || 0;
};

export const markStudentNotificationRead = async ({ studentId, notificationId }) => {
  const student_id = toSafeString(studentId);
  const id = toSafeString(notificationId);

  if (!student_id || !id) {
    throw new Error("studentId and notificationId are required");
  }

  const { data, error } = await supabase
    .from("student_notifications")
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("student_id", student_id)
    .select(selectNotificationColumns)
    .single();

  if (error) {
    throw error;
  }

  return data;
};

const sendExpoPushBatch = async (messages) => {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Expo push API failed with ${response.status}`);
  }

  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
};

export const sendStudentPushNotification = async ({
  studentId,
  title,
  body,
  notificationType = "general",
  sourceType = null,
  sourceId = null,
  data = {},
}) => {
  const notification = await storeStudentNotification({
    studentId,
    title,
    body,
    notificationType,
    sourceType,
    sourceId,
    data,
    deliveryStatus: "queued",
  });

  const tokens = await listStudentPushTokens(studentId);
  const validTokens = tokens
    .map((row) => toSafeString(row.push_token))
    .filter((token) => isExpoPushToken(token));

  if (!validTokens.length) {
    const storedNotification = await updateStudentNotification(notification.id, {
      delivery_status: "stored_no_token",
    });

    return {
      notification: storedNotification,
      push: {
        sent: false,
        reason: "no_push_token",
        tokens: 0,
      },
    };
  }

  const pushData = {
    ...normalizePayloadData(data),
    notification_id: notification.id,
    notification_type: notificationType,
    source_type: sourceType,
    source_id: sourceId,
  };

  const batches = chunkArray(
    validTokens.map((token) => ({
      to: token,
      sound: "default",
      title: toSafeString(title),
      body: toSafeString(body),
      data: pushData,
    }))
  );

  const receipts = [];
  for (const batch of batches) {
    const result = await sendExpoPushBatch(batch);
    receipts.push(result);
  }

  const updatedNotification = await updateStudentNotification(notification.id, {
    delivery_status: "sent",
    sent_at: new Date().toISOString(),
  });

  return {
    notification: updatedNotification,
    push: {
      sent: true,
      tokens: validTokens.length,
      receipts,
    },
  };
};
