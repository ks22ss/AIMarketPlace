import cors from "cors";
import express from "express";

const port = Number(process.env.PORT) || 3001;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "aimarketplace-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "aimarketplace-api",
    timestamp: new Date().toISOString(),
  });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
