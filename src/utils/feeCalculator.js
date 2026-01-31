export const calculateStatus = (total, paid) => {
  return paid >= total ? "PAID" : "DUE";
};
