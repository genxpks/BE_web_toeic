import { app } from './app.js';
import { env } from './config/env.js';

app.listen(env.port, () => {
  console.log(`Server running on http://localhost:${env.port}`);
});
app.get("/", (_req, res) => {
  res.json({
    message: "TOEIC Express Backend is running",
  });
});
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});