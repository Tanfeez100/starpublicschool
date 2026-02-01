import app from "./app.js";
import marksRoutes from "./routes/marks.routes.js";
import feesRoutes from "./routes/fee.routes.js";
import authRoutes from "./routes/auth.routes.js";
import studentsRoutes from "./routes/students.routes.js";
import feeRoutes from "./routes/fee.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import billRoutes from "./routes/bill.routes.js";
import subjectRoutes from "./routes/subject.routes.js";
import driveRoutes from "./routes/drive.routes.js";
console.log("ENV URL:", process.env.SUPABASE_URL);
console.log(
  "ENV KEY:",
  process.env.SUPABASE_SERVICE_KEY ? "OK" : "MISSING"
);
app.use("/api/auth", authRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/marks", marksRoutes);
app.use("/api/fees", feeRoutes);
app.use("/api/subjects", subjectRoutes);

app.use("/api/invoice", invoiceRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/drive", driveRoutes);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
