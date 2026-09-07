import { getRawDb } from "@/db";
import {
  initialAudit,
  initialDecisions,
  type AuditEvent,
  type Decision,
} from "@/app/data";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import {
  getPerformanceSnapshot,
  type PerformanceSnapshot,
} from "@/lib/performance-store";

type DecisionRow = {
  id: string;
  status: string;
  severity: Decision["severity"];
  client: string;
  platform: string;
  owner_label: string;
  autonomy: Decision["autonomy"];
  title: string;
  diagnosis: string;
  proposed_action: string;
  impact: string;
  confidence: Decision["confidence"];
  agent: string;
  rule: string;
  age_label: string;
  expires_label: string;
  before_value: string;
  after_value: string;
  guardrail: string;
  metric: string;
  delta: string;
  primary_label: string;
  execution_status: string;
  generated_at: number;
  expires_at: number;
  snoozed_until: number | null;
  resolved_at: number | null;
  version: number;
  updated_at: number;
};

type AuditRow = {
  id: string;
  event_type: string;
  actor_name_snapshot: string;
  action_label: string;
  client_snapshot: string;
  origin_snapshot: string;
  result: string;
  created_at: number;
};

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: string;
};

export type DashboardUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

export type DashboardSnapshot = {
  user: DashboardUser;
  decisions: Decision[];
  auditEvents: AuditEvent[];
  dataMode: "pilot";
  dataUpdatedAt: number | null;
  performance: PerformanceSnapshot;
};

export type DecisionAction = {
  type: "approve" | "discard" | "edit" | "escalate" | "postpone" | "undo";
  id: string;
  expectedVersion: number;
  idempotencyKey: string;
  reason?: string;
  after?: string;
};

export class DashboardStoreError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const DECISION_SELECT = `
  SELECT id, status, severity, client, platform, owner_label, autonomy,
    title, diagnosis, proposed_action, impact, confidence, agent, rule,
    age_label, expires_label, before_value, after_value, guardrail,
    metric, delta, primary_label, execution_status, generated_at, expires_at,
    snoozed_until, resolved_at, version, updated_at
  FROM decisions
`;

export async function getDashboardSnapshot(
  identity: ChatGPTUser,
): Promise<DashboardSnapshot> {
  const db = getRawDb();
  await ensurePilotSeed(db);
  const user = await upsertUser(db, identity);
  const now = Date.now();

  const [decisionResult, auditResult, performance] = await Promise.all([
    db
      .prepare(
        `${DECISION_SELECT}
         WHERE status = 'pending'
           AND expires_at > ?
           AND (snoozed_until IS NULL OR snoozed_until <= ?)
         ORDER BY CASE severity
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           ELSE 4
         END, generated_at ASC`,
      )
      .bind(now, now)
      .all<DecisionRow>(),
    db
      .prepare(
        `SELECT id, event_type, actor_name_snapshot, action_label, client_snapshot,
          origin_snapshot, result, created_at
         FROM audit_events
         ORDER BY created_at DESC
         LIMIT 100`,
      )
      .all<AuditRow>(),
    getPerformanceSnapshot(identity.id),
  ]);

  const dataUpdatedAt = Math.max(
    0,
    ...decisionResult.results.map((row) => Number(row.updated_at)),
    ...auditResult.results.map((row) => Number(row.created_at)),
  );

  return {
    user,
    decisions: decisionResult.results.map(toDecision),
    auditEvents: auditResult.results.map(toAuditEvent),
    dataMode: "pilot",
    dataUpdatedAt: dataUpdatedAt || null,
    performance,
  };
}

export async function applyDecisionAction(
  identity: ChatGPTUser,
  input: DecisionAction,
): Promise<DashboardSnapshot> {
  const db = getRawDb();
  await ensurePilotSeed(db);
  const user = await upsertUser(db, identity);
  validateMutationInput(input);

  const duplicate = await db
    .prepare("SELECT id FROM audit_events WHERE idempotency_key = ? LIMIT 1")
    .bind(input.idempotencyKey)
    .first<{ id: string }>();
  if (duplicate) return getDashboardSnapshot(identity);

  const decision = await db
    .prepare(`${DECISION_SELECT} WHERE id = ? LIMIT 1`)
    .bind(input.id)
    .first<DecisionRow>();
  if (!decision) throw new DashboardStoreError("Decisión no encontrada", 404);

  const now = Date.now();
  const eventId = `LOG-${crypto.randomUUID()}`;
  const origin = `${decision.agent} · ${decision.rule}`;
  let update: D1PreparedStatement;
  let eventType: string;
  let actionLabel: string;
  let result: string;
  const fromStatus = decision.status;
  let toStatus = decision.status;
  const reason = input.reason?.trim() || null;
  let changes: Record<string, unknown> = {};

  if (input.type === "undo") {
    if (
      decision.status !== "approved" ||
      !decision.resolved_at ||
      decision.resolved_at < now - 24 * 60 * 60 * 1000 ||
      decision.execution_status === "executed"
    ) {
      throw new DashboardStoreError(
        "Esta decisión ya no se puede devolver a la cola",
        409,
      );
    }
    eventType = "reopened";
    actionLabel = "Devolvió la decisión a la cola";
    result = "Pendiente de nueva revisión";
    toStatus = "pending";
    update = db
      .prepare(
        `UPDATE decisions
         SET status = 'pending', execution_status = 'not_requested',
           resolved_at = NULL, resolved_by_user_id = NULL,
           version = version + 1, updated_at = ?
         WHERE id = ? AND status = 'approved' AND version = ?
           AND resolved_at >= ? AND execution_status != 'executed'`,
      )
      .bind(
        now,
        input.id,
        input.expectedVersion,
        now - 24 * 60 * 60 * 1000,
      );
  } else {
    if (decision.status !== "pending") {
      throw new DashboardStoreError("La decisión ya fue resuelta", 409);
    }
    if (decision.expires_at <= now) {
      throw new DashboardStoreError("La recomendación venció y ya no se puede firmar", 409);
    }
    if (decision.snoozed_until && decision.snoozed_until > now) {
      throw new DashboardStoreError("La recomendación está pospuesta", 409);
    }

    switch (input.type) {
      case "approve": {
        eventType = "approved";
        actionLabel = "Firmó propuesta para ejecución manual";
        result = "Firma registrada · ejecución manual pendiente";
        toStatus = "approved";
        update = db
          .prepare(
            `UPDATE decisions
             SET status = 'approved', execution_status = 'manual_required',
               resolved_at = ?, resolved_by_user_id = ?,
               version = version + 1, updated_at = ?
             WHERE id = ? AND status = 'pending' AND version = ?`,
          )
          .bind(now, user.id, now, input.id, input.expectedVersion);
        break;
      }
      case "discard": {
        if (!reason) {
          throw new DashboardStoreError(
            "Selecciona un motivo para descartar",
            400,
          );
        }
        eventType = "discarded";
        actionLabel = "Descartó recomendación";
        result = reason;
        toStatus = "discarded";
        update = db
          .prepare(
            `UPDATE decisions
             SET status = 'discarded', discard_reason = ?, resolved_at = ?,
               resolved_by_user_id = ?, version = version + 1, updated_at = ?
             WHERE id = ? AND status = 'pending' AND version = ?`,
          )
          .bind(
            reason,
            now,
            user.id,
            now,
            input.id,
            input.expectedVersion,
          );
        break;
      }
      case "edit": {
        const after = input.after?.trim();
        if (!after) {
          throw new DashboardStoreError("El cambio propuesto es obligatorio", 400);
        }
        eventType = "edited";
        actionLabel = "Editó la propuesta";
        result = "Cambio guardado · requiere una nueva revisión humana";
        changes = { after: { from: decision.after_value, to: after } };
        update = db
          .prepare(
            `UPDATE decisions
             SET after_value = ?, confidence = 'Media',
               proposed_action = ?, version = version + 1, updated_at = ?
             WHERE id = ? AND status = 'pending' AND version = ?`,
          )
          .bind(
            after,
            `${decision.proposed_action} Ajuste editado por ${user.displayName}.`,
            now,
            input.id,
            input.expectedVersion,
          );
        break;
      }
      case "escalate": {
        eventType = "escalated";
        actionLabel = "Escaló la decisión";
        result = "Asignada a Lead AdTech";
        changes = { owner: "Lead AdTech" };
        update = db
          .prepare(
            `UPDATE decisions
             SET owner_label = 'Lead AdTech', version = version + 1,
               updated_at = ?
             WHERE id = ? AND status = 'pending' AND version = ?`,
          )
          .bind(now, input.id, input.expectedVersion);
        break;
      }
      case "postpone": {
        const snoozedUntil = now + 24 * 60 * 60 * 1000;
        eventType = "postponed";
        actionLabel = "Pospuso la decisión";
        result = "Volverá a revisión mañana";
        changes = { snoozedUntil };
        update = db
          .prepare(
            `UPDATE decisions
             SET snoozed_until = ?, expires_label = 'Pospuesta hasta mañana · 09:00',
               version = version + 1, updated_at = ?
             WHERE id = ? AND status = 'pending' AND version = ?`,
          )
          .bind(snoozedUntil, now, input.id, input.expectedVersion);
        break;
      }
    }
  }

  const audit = db
    .prepare(
      `INSERT INTO audit_events (
        id, decision_id, actor_user_id, actor_name_snapshot,
        actor_email_snapshot, event_type, from_status, to_status,
        action_label, result, reason, client_snapshot, origin_snapshot,
        changes_json, idempotency_key, created_at
      )
      SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, client, ?, ?, ?, ?
      FROM decisions
      WHERE id = ? AND status = ? AND version = ?`,
    )
    .bind(
      eventId,
      user.id,
      user.displayName,
      user.email,
      eventType,
      fromStatus,
      toStatus,
      actionLabel,
      result,
      reason,
      origin,
      JSON.stringify(changes),
      input.idempotencyKey,
      now,
      input.id,
      decision.status,
      input.expectedVersion,
    );

  const results = await db.batch([audit, update]);
  if ((results[1].meta.changes ?? 0) !== 1) {
    throw new DashboardStoreError(
      "La decisión cambió en otra sesión. Recarga antes de continuar.",
      409,
    );
  }

  return getDashboardSnapshot(identity);
}

export async function approveDecisionBatch(
  identity: ChatGPTUser,
  items: Array<{ id: string; expectedVersion: number }>,
  idempotencyKey: string,
): Promise<DashboardSnapshot> {
  if (items.length < 1 || items.length > 10) {
    throw new DashboardStoreError("El lote debe contener entre 1 y 10 decisiones", 400);
  }
  if (
    typeof idempotencyKey !== "string" ||
    !idempotencyKey.trim() ||
    items.some(
      (item) =>
        typeof item?.id !== "string" ||
        !item.id.trim() ||
        !Number.isInteger(item.expectedVersion) ||
        item.expectedVersion < 1,
    )
  ) {
    throw new DashboardStoreError("Solicitud de lote incompleta", 400);
  }

  const db = getRawDb();
  await ensurePilotSeed(db);
  const user = await upsertUser(db, identity);
  const duplicate = await db
    .prepare(
      "SELECT id FROM audit_events WHERE idempotency_key LIKE ? LIMIT 1",
    )
    .bind(`${idempotencyKey}:%`)
    .first<{ id: string }>();
  if (duplicate) return getDashboardSnapshot(identity);
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];

  for (const item of items) {
    const decision = await db
      .prepare(`${DECISION_SELECT} WHERE id = ? LIMIT 1`)
      .bind(item.id)
      .first<DecisionRow>();
    if (!decision || decision.status !== "pending") {
      throw new DashboardStoreError("Una decisión del lote ya no está pendiente", 409);
    }
    if (decision.expires_at <= now) {
      throw new DashboardStoreError("Una decisión del lote ya venció", 409);
    }
    if (decision.snoozed_until && decision.snoozed_until > now) {
      throw new DashboardStoreError("Una decisión del lote está pospuesta", 409);
    }
    const itemKey = `${idempotencyKey}:${item.id}`;
    statements.push(
      db
        .prepare(
          `INSERT INTO audit_events (
            id, decision_id, actor_user_id, actor_name_snapshot,
            actor_email_snapshot, event_type, from_status, to_status,
            action_label, result, client_snapshot, origin_snapshot,
            changes_json, idempotency_key, created_at
          )
          SELECT ?, id, ?, ?, ?, 'approved', 'pending', 'approved',
            primary_label, 'Firma agrupada · ejecución manual pendiente',
            client, ?, '{}', ?, ?
          FROM decisions
          WHERE id = ? AND status = 'pending' AND version = ?`,
        )
        .bind(
          `LOG-${crypto.randomUUID()}`,
          user.id,
          user.displayName,
          user.email,
          `${decision.agent} · ${decision.rule}`,
          itemKey,
          now,
          item.id,
          item.expectedVersion,
        ),
      db
        .prepare(
          `UPDATE decisions
           SET status = 'approved', execution_status = 'manual_required',
             resolved_at = ?, resolved_by_user_id = ?, version = version + 1,
             updated_at = ?
           WHERE id = ? AND status = 'pending' AND version = ?`,
        )
        .bind(now, user.id, now, item.id, item.expectedVersion),
    );
  }

  const results = await db.batch(statements);
  const failedUpdate = results.some(
    (result, index) => index % 2 === 1 && (result.meta.changes ?? 0) !== 1,
  );
  if (failedUpdate) {
    throw new DashboardStoreError(
      "El lote cambió en otra sesión. Recarga antes de continuar.",
      409,
    );
  }

  return getDashboardSnapshot(identity);
}

async function upsertUser(
  db: D1Database,
  identity: ChatGPTUser,
): Promise<DashboardUser> {
  const now = Date.now();
  const email = identity.email.trim().toLowerCase();
  await db
    .prepare(
      `INSERT INTO users (id, email, display_name, role, is_active, created_at, last_seen_at)
       VALUES (?, ?, ?, 'buyer', 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         display_name = excluded.display_name,
         last_seen_at = excluded.last_seen_at`,
    )
    .bind(identity.id, email, identity.displayName, now, now)
    .run();

  const row = await db
    .prepare(
      "SELECT id, email, display_name, role FROM users WHERE id = ? LIMIT 1",
    )
    .bind(identity.id)
    .first<UserRow>();
  if (!row) throw new DashboardStoreError("No se pudo crear la sesión", 500);

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  };
}

async function ensurePilotSeed(db: D1Database) {
  const seeded = await db
    .prepare("SELECT value FROM app_meta WHERE key = 'pilot_seed_v1' LIMIT 1")
    .first<{ value: string }>();
  if (seeded) return;

  const now = Date.now();
  const ages = [18 * 60, 60 * 60, 3 * 60 * 60, 7 * 60 * 60, 11 * 60 * 60];
  const expiryHours = [53, 49, 46, 39, 28];
  const statements: D1PreparedStatement[] = initialDecisions.map(
    (decision, index) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO decisions (
            id, status, severity, client, platform, owner_label, autonomy,
            title, diagnosis, proposed_action, impact, confidence, agent, rule,
            age_label, expires_label, before_value, after_value, guardrail,
            metric, delta, primary_label, generated_at, expires_at,
            execution_status, version, created_at, updated_at
          ) VALUES (
            ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, 'not_requested', 1, ?, ?
          )`,
        )
        .bind(
          decision.id,
          decision.severity,
          decision.client,
          decision.platform,
          decision.owner,
          decision.autonomy,
          decision.title,
          decision.diagnosis,
          decision.proposedAction,
          decision.impact,
          decision.confidence,
          decision.agent,
          decision.rule,
          decision.age,
          decision.expires,
          decision.before,
          decision.after,
          decision.guardrail,
          decision.metric,
          decision.delta,
          decision.primaryLabel,
          now - ages[index],
          now + expiryHours[index] * 60 * 60 * 1000,
          now,
          now,
        ),
  );

  initialAudit.forEach((event, index) => {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO audit_events (
            id, actor_name_snapshot, event_type, action_label, result,
            client_snapshot, origin_snapshot, changes_json,
            idempotency_key, created_at
          ) VALUES (?, ?, 'seeded', ?, ?, ?, ?, '{}', ?, ?)`,
        )
        .bind(
          event.id,
          event.user,
          event.action,
          event.result,
          event.client,
          event.origin,
          `seed:${event.id}`,
          now - (index + 2) * 70 * 60 * 1000,
        ),
    );
  });

  statements.push(
    db
      .prepare(
        "INSERT OR IGNORE INTO app_meta (key, value, updated_at) VALUES ('pilot_seed_v1', 'complete', ?)",
      )
      .bind(now),
  );
  await db.batch(statements);
}

function validateMutationInput(input: DecisionAction) {
  const allowed = [
    "approve",
    "discard",
    "edit",
    "escalate",
    "postpone",
    "undo",
  ];
  if (
    !allowed.includes(input.type) ||
    typeof input.id !== "string" ||
    !input.id.trim() ||
    typeof input.idempotencyKey !== "string" ||
    !input.idempotencyKey.trim()
  ) {
    throw new DashboardStoreError("Solicitud incompleta", 400);
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new DashboardStoreError("Versión de decisión inválida", 400);
  }
}

function toDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    severity: row.severity,
    client: row.client,
    platform: row.platform,
    owner: row.owner_label,
    autonomy: row.autonomy,
    title: row.title,
    diagnosis: row.diagnosis,
    proposedAction: row.proposed_action,
    impact: row.impact,
    confidence: row.confidence,
    agent: row.agent,
    rule: row.rule,
    age: formatElapsed(row.generated_at),
    expires: formatRemaining(row.expires_at),
    before: row.before_value,
    after: row.after_value,
    guardrail: row.guardrail,
    metric: row.metric,
    delta: row.delta,
    primaryLabel: row.primary_label,
    version: row.version,
  };
}

function formatElapsed(value: number): string {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - value) / 60_000));
  if (elapsedMinutes < 1) return "Ahora";
  if (elapsedMinutes < 60) return `Hace ${elapsedMinutes} min`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} ${days === 1 ? "día" : "días"}`;
}

function formatRemaining(value: number): string {
  const remainingMinutes = Math.max(0, Math.ceil((value - Date.now()) / 60_000));
  if (remainingMinutes < 60) return `Vence en ${remainingMinutes} min`;
  const hours = Math.ceil(remainingMinutes / 60);
  if (hours < 48) return `Vence en ${hours} h`;
  const days = Math.ceil(hours / 24);
  return `Vence en ${days} ${days === 1 ? "día" : "días"}`;
}

function toAuditEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    time: formatEventTime(row.created_at),
    user: row.actor_name_snapshot,
    action: row.action_label,
    client: row.client_snapshot,
    origin: row.origin_snapshot,
    result: row.result,
    dataOrigin: row.event_type === "seeded" ? "pilot" : "recorded_action",
  };
}

function formatEventTime(timestamp: number) {
  if (Date.now() - timestamp < 90 * 1000) return "Ahora";
  const date = new Date(timestamp);
  const day = new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Santiago",
  }).format(date);
  const time = new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Santiago",
  }).format(date);
  return `${day} · ${time}`;
}
