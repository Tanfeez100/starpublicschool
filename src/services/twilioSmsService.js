const toSafeString = (value) => String(value ?? "").trim();

const normalizePhoneForSms = (value) => {
  const digits = toSafeString(value).replace(/\D/g, "");
  if (!digits) return "";
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

  const body = [
    "Gyanoday Public School fee payment received.",
    studentName ? `Student: ${studentName}` : "",
    invoiceNumber ? `Invoice: ${invoiceNumber}` : "",
    month ? `Month: ${month}` : "",
    `Paid: Rs. ${formatAmount(amountPaid)}`,
    Number.parseFloat(remaining || 0) > 0 ? `Balance: Rs. ${formatAmount(remaining)}` : "Balance: Rs. 0.00",
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
    throw new Error(data?.message || "Failed to send Twilio SMS");
  }

  return { sent: true, sid: data?.sid, status: data?.status };
};
