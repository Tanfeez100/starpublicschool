const normalizePhoneForWhatsApp = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

export const sendReceiptOnWhatsApp = async ({
  mobile,
  studentName,
  receiptUrl,
  invoiceNumber,
  amount,
}) => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = normalizePhoneForWhatsApp(mobile);

  if (!accessToken || !phoneNumberId || !to || !receiptUrl) {
    return {
      sent: false,
      skipped: true,
      reason: "WhatsApp credentials, mobile number, or receipt URL missing",
    };
  }

  const caption = [
    `Star Public School fee receipt${invoiceNumber ? ` (${invoiceNumber})` : ""}.`,
    studentName ? `Student: ${studentName}` : "",
    amount ? `Amount: Rs. ${Number(amount).toFixed(2)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "document",
        document: {
          link: receiptUrl,
          filename: `fee-receipt-${invoiceNumber || "gps"}.pdf`,
          caption,
        },
      }),
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error?.message || "Failed to send WhatsApp receipt");
  }

  return { sent: true, data };
};

