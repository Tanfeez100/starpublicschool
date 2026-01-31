export const calculateMonthlyFine = (fee, finePerMonth = 50) => {
  const today = new Date();
  const [year, month] = fee.month.split("-").map(Number);

  const fineStartDate = new Date(year, month - 1, 5);

  if (
    today > fineStartDate &&
    (fee.status === "DUE" || fee.status === "PARTIAL") &&
    !fee.fine_waived
  ) {
    return finePerMonth;
  }

  return 0;
};

