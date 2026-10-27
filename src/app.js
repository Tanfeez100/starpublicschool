import express from "express";
import cors from "cors";
import megaRoutes from "./routes/mega.routes.js";

import path from "path";

const app = express();

// ⚡ OPTIMIZATION: Set timeout for all requests to 40 seconds (includes Supabase 30s timeout)
app.use((req, res, next) => {
  req.setTimeout(40000);
  res.setTimeout(40000);
  next();
});

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Static uploads serving (cached result PDFs & bills fallback)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), {
  maxAge: "1d",
  setHeaders: (res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
  },
}));

// Mega routes (if needed)
app.use("/api/mega", megaRoutes);

// ⚡ OPTIMIZATION: Global error handler for graceful timeout errors
app.use((err, req, res, next) => {
  if (err.code === 'ECONNABORTED' || err.code === 'ESOCKETTIMEDOUT') {
    return res.status(503).json({
      message: "Request timeout. Please try again.",
      error: "REQUEST_TIMEOUT"
    });
  }
  
  console.error("Unhandled error:", err);
  res.status(500).json({
    message: "Internal server error",
    error: err.message
  });
});

export default app;