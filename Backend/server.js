const express = require("express");
const cors = require("cors");
const path = require("path");

// Always load Backend/.env regardless of where node is started from
require("dotenv").config({ path: path.join(__dirname, ".env") });

const router = require("./routes");

const app = express();

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api", router);

// Health check endpoint (backend)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// Serve Frontend folder (so http://localhost:5000/ works)
const frontendPath = path.join(__dirname, "..", "Frontend");
app.use(express.static(frontendPath));

// If user opens any non-API route in the browser, return the frontend
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// 404 handler for API only (must be after routes)
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`AirSure backend running on http://localhost:${PORT}`);
});