import express from "express";
import cors from "cors";
import resultRoutes from "./routes/result.routes.js";
import marksRoutes from "./routes/marks.routes.js";
import studentsRoutes from "./routes/students.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import feeRoutes from "./routes/fee.routes.js";
const app = express();
app.use(cors());
app.use(express.json());


app.use("/api/results", resultRoutes);
app.use("/api/marks", marksRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api", invoiceRoutes);
app.use("/api/fees", feeRoutes);

export default app;