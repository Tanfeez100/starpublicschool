import app from "./app.js";
import authRoutes from "./routes/auth.routes.js";
import studentsRoutes from "./routes/students.routes.js";
import marksRoutes from "./routes/marks.routes.js";
import resultRoutes from "./routes/result.routes.js";
import subjectRoutes from "./routes/subject.routes.js";
import billRoutes from "./routes/bill.routes.js";
import feeStructureRoutes from "./routes/feeStructure.routes.js";
import feesRoutes from "./routes/fees.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import megaRoutes from "./routes/mega.routes.js";
import promotionRoutes from "./routes/promotion.routes.js";
import migrationRoutes from "./routes/migration.routes.js";

console.log("ENV URL:", process.env.SUPABASE_URL);
console.log(
  "ENV KEY:",
  process.env.SUPABASE_SERVICE_KEY ? "OK" : "MISSING"
);

// Register all routes
app.use("/api/auth", authRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/marks", marksRoutes);
app.use("/api/result", resultRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/bills", billRoutes);

// Fee Management System Routes
app.use("/api/fee-structure", feeStructureRoutes);
app.use("/api/fees", feesRoutes);
app.use("/api/invoice", invoiceRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/migration", migrationRoutes);

// MEGA Image Storage Routes
app.use("/api/mega", megaRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
