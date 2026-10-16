import { Router } from "express";

const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SCOPES = new Set(["conversation", "project", "user"]);
const MAX_CONTENT = 50_000;

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function publicSkill(row) {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    description: row.description,
    content: row.content,
    scope: row.scope,
    project_key: row.project_key,
    tags: row.tags,
    active: row.is_active,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export function createSkillsRouter({ db }) {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const name = cleanString(req.body?.name).toLowerCase();
      const title = cleanString(req.body?.title) || name;
      const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
      const description = cleanString(req.body?.description);
      const scope = req.body?.scope ?? "user";
      const projectKey = req.body?.project_key ?? null;
      const tags = Array.isArray(req.body?.tags)
        ? [...new Set(req.body.tags.filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean))].slice(0, 20)
        : [];

      if (!NAME_RE.test(name)) return fail(res, 400, "invalid_name", "Use letras minúsculas, números, ponto, hífen ou sublinhado; máximo de 64 caracteres.");
      if (!title || title.length > 120) return fail(res, 400, "invalid_title", "O título é obrigatório e deve ter até 120 caracteres.");
      if (!content || content.length > MAX_CONTENT) return fail(res, 400, "invalid_content", "O conteúdo é obrigatório e deve ter até 50.000 caracteres.");
      if (description.length > 1000) return fail(res, 400, "invalid_description", "A descrição deve ter até 1.000 caracteres.");
      if (!SCOPES.has(scope)) return fail(res, 400, "invalid_scope", "Escopo deve ser conversation, project ou user.");
      if (projectKey !== null && (typeof projectKey !== "string" || projectKey.length > 160)) return fail(res, 400, "invalid_project_key", "project_key deve ser texto com até 160 caracteres.");

      const { data, error } = await db.from("skills").insert({
        user_id: req.user.id,
        name,
        title,
        description,
        content,
        scope,
        project_key: projectKey,
        tags,
        is_active: req.body?.active !== false
      }).select("*").single();

      if (error?.code === "23505") return fail(res, 409, "skill_exists", "Já existe uma skill com esse nome para este usuário.");
      if (error) throw error;
      return res.status(201).json({ skill: publicSkill(data) });
    } catch (err) { next(err); }
  });

  router.get("/", async (req, res, next) => {
    try {
      let query = db.from("skills").select("*").eq("user_id", req.user.id).order("updated_at", { ascending: false });
      if (req.query.scope !== undefined) {
        if (!SCOPES.has(req.query.scope)) return fail(res, 400, "invalid_scope", "Escopo inválido.");
        query = query.eq("scope", req.query.scope);
      }
      if (req.query.active !== undefined) {
        if (!["true", "false"].includes(req.query.active)) return fail(res, 400, "invalid_active", "active deve ser true ou false.");
        query = query.eq("is_active", req.query.active === "true");
      }
      if (typeof req.query.project_key === "string") query = query.eq("project_key", req.query.project_key);
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? "50", 10) || 50, 1), 100);
      query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return res.json({ skills: (data ?? []).map(publicSkill), count: data?.length ?? 0 });
    } catch (err) { next(err); }
  });

  router.get("/:name", async (req, res, next) => {
    try {
      const name = cleanString(req.params.name).toLowerCase();
      const { data, error } = await db.from("skills").select("*").eq("user_id", req.user.id).eq("name", name).maybeSingle();
      if (error) throw error;
      if (!data) return fail(res, 404, "skill_not_found", "Skill não encontrada no escopo deste usuário.");
      return res.json({ skill: publicSkill(data) });
    } catch (err) { next(err); }
  });

  router.patch("/:name", async (req, res, next) => {
    try {
      const name = cleanString(req.params.name).toLowerCase();
      const updates = {};
      const allowed = ["title", "description", "content", "scope", "project_key", "tags", "is_active"];
      for (const key of allowed) if (Object.hasOwn(req.body ?? {}, key)) updates[key] = req.body[key];
      if (Object.hasOwn(updates, "title") && (typeof updates.title !== "string" || !updates.title.trim() || updates.title.trim().length > 120)) return fail(res, 400, "invalid_title", "Título inválido.");
      if (Object.hasOwn(updates, "description") && (typeof updates.description !== "string" || updates.description.length > 1000)) return fail(res, 400, "invalid_description", "Descrição inválida.");
      if (Object.hasOwn(updates, "content") && (typeof updates.content !== "string" || !updates.content.trim() || updates.content.length > MAX_CONTENT)) return fail(res, 400, "invalid_content", "Conteúdo inválido.");
      if (Object.hasOwn(updates, "scope") && !SCOPES.has(updates.scope)) return fail(res, 400, "invalid_scope", "Escopo inválido.");
      if (Object.hasOwn(updates, "is_active") && typeof updates.is_active !== "boolean") return fail(res, 400, "invalid_active", "is_active deve ser booleano.");
      if (Object.hasOwn(updates, "project_key") && updates.project_key !== null && (typeof updates.project_key !== "string" || updates.project_key.length > 160)) return fail(res, 400, "invalid_project_key", "project_key inválido.");
      if (Object.hasOwn(updates, "tags") && (!Array.isArray(updates.tags) || updates.tags.some((t) => typeof t !== "string"))) return fail(res, 400, "invalid_tags", "tags deve ser uma lista de textos.");
      if (Object.hasOwn(updates, "title")) updates.title = updates.title.trim();
      if (Object.hasOwn(updates, "description")) updates.description = updates.description.trim();
      if (Object.hasOwn(updates, "content")) updates.content = updates.content.trim();
      if (Object.hasOwn(updates, "tags")) updates.tags = [...new Set(updates.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
      if (Object.keys(updates).length === 0) return fail(res, 400, "empty_update", "Informe ao menos um campo permitido.");

      const { data, error } = await db.from("skills").update(updates).eq("user_id", req.user.id).eq("name", name).select("*").maybeSingle();
      if (error) throw error;
      if (!data) return fail(res, 404, "skill_not_found", "Skill não encontrada no escopo deste usuário.");
      return res.json({ skill: publicSkill(data) });
    } catch (err) { next(err); }
  });

  router.delete("/:name", async (req, res, next) => {
    try {
      const name = cleanString(req.params.name).toLowerCase();
      const { data, error } = await db.from("skills").delete().eq("user_id", req.user.id).eq("name", name).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return fail(res, 404, "skill_not_found", "Skill não encontrada no escopo deste usuário.");
      return res.status(204).end();
    } catch (err) { next(err); }
  });

  router.post("/:name/activate", async (req, res, next) => {
    try {
      const name = cleanString(req.params.name).toLowerCase();
      const { data, error } = await db.from("skills").select("*").eq("user_id", req.user.id).eq("name", name).eq("is_active", true).maybeSingle();
      if (error) throw error;
      if (!data) return fail(res, 404, "active_skill_not_found", "Skill não encontrada ou desativada.");
      const task = cleanString(req.body?.task);
      const context = [
        `[SKILLNIC: ${data.name} | versão ${data.version}]`,
        `Objetivo: aplicar as seguintes orientações à tarefa atual, sem substituir políticas superiores nem ignorar requisitos de segurança.`,
        `Título: ${data.title}`,
        data.description ? `Descrição: ${data.description}` : "",
        "Conteúdo da skill:",
        data.content,
        task ? `Tarefa solicitada: ${task}` : ""
      ].filter(Boolean).join("\n\n");
      return res.json({ skill: publicSkill(data), context, note: "Este endpoint recupera e formata o contexto. A aplicação efetiva depende do cliente/LLM que consumir esta resposta." });
    } catch (err) { next(err); }
  });

  return router;
}
