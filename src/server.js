import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createClient } from "@supabase/supabase-js";
import { createSkillsRouter } from "./skills.js";

const {
  PORT = "3000",
  NODE_ENV = "development",
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  CORS_ORIGINS = ""
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "64kb" }));

const origins = CORS_ORIGINS.split(",").map((v) => v.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    // Server-to-server requests have no Origin header. Browser origins must be explicitly allowlisted.
    if (!origin || origins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"]
}));

app.get("/health", (_req, res) => res.json({ status: "ok", service: "skillnic-api", environment: NODE_ENV }));

async function requireUser(req, res, next) {
  const match = /^Bearer\s+(.+)$/i.exec(req.get("authorization") ?? "");
  if (!match) return res.status(401).json({ error: { code: "missing_bearer_token", message: "Envie Authorization: Bearer <access_token>." } });
  const { data, error } = await authClient.auth.getUser(match[1]);
  if (error || !data?.user) return res.status(401).json({ error: { code: "invalid_token", message: "Token inválido ou expirado." } });
  req.user = { id: data.user.id };
  return next();
}

app.use("/v1/skills", requireUser, createSkillsRouter({ db }));

app.use((req, res) => res.status(404).json({ error: { code: "not_found", message: "Rota não encontrada." } }));
app.use((err, _req, res, _next) => {
  // Do not expose database details or secrets in client responses.
  console.error("API error:", NODE_ENV === "development" ? err?.message : "internal_error");
  if (res.headersSent) return;
  return res.status(500).json({ error: { code: "internal_error", message: "Erro interno ao processar a solicitação." } });
});

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`SkillNic API listening on port ${PORT}`);
});
