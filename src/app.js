import express from "express";
import cors from "cors";
import megaRoutes from "./routes/mega.routes.js";

const app = express();
app.use(cors());
app.use(express.json());

// Mega routes (if needed)
app.use("/api/mega", megaRoutes);

export default app;