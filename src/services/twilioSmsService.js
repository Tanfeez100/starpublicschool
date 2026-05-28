const toSafeString = (value) => String(value ?? "").trim();

const normalizePhoneForSms = (value) => {
  const digits = toSafeString(value).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
};

const formatAmount = (value) => {
  const amount = Number.parseFloat(value || 0) || 0;
  return amount.toFixed(2);
};

export const sendFeePaymentSms = async ({
  mobile,
  studentName,
  invoiceNumber,
  month,
  dueBeforePayment,
  amountPaid,
  remaining,
  receiptUrl,
}) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const to = normalizePhoneForSms(mobile);

  if (!accountSid || !authToken || !to || (!messagingServiceSid && !from)) {
    return {
      sent: false,
      skipped: true,
      reason: "Twilio credentials, sender, or student mobile number missing",
    };
  }

  const balance = Number.parseFloat(remaining || 0) || 0;
  const statusLine =
    balance > 0
      ? `Abhi baaki dues: Rs. ${formatAmount(balance)}`
      : "Aapka payment full and final ho gaya hai. Balance: Rs. 0.00";

  const body = [
    "Gyanoday Public School: Fee payment received.",
    studentName ? `Student: ${studentName}` : "",
    invoiceNumber ? `Invoice: ${invoiceNumber}` : "",
    month ? `Month: ${month}` : "",
    `Payment kiya: Rs. ${formatAmount(amountPaid)}`,
    `Payment se pehle dues: Rs. ${formatAmount(dueBeforePayment)}`,
    statusLine,
    receiptUrl ? `Receipt: ${receiptUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const form = new URLSearchParams();
  form.set("To", to);
  form.set("Body", body);

  if (messagingServiceSid) {
    form.set("MessagingServiceSid", messagingServiceSid);
  } else {
    form.set("From", normalizePhoneForSms(from));
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || "Failed to send Twilio SMS");
    error.status = response.status;
    error.code = data?.code;
    error.moreInfo = data?.more_info;
    throw error;
  }

  console.log("Twilio fee payment SMS sent:", {
    sid: data?.sid,
    status: data?.status,
    to: to.replace(/\d(?=\d{4})/g, "*"),
  });

  return { sent: true, sid: data?.sid, status: data?.status, to };
};
