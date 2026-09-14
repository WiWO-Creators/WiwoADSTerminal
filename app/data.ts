/**
 * Contratos de dominio de WiWO.ADS.
 *
 * Este archivo define tipos, no datos. Las decisiones, la bitácora y los
 * chequeos de salud llegan desde la base y desde el motor de reglas; nada
 * se declara acá como valor fijo.
 */

export type ViewKey =
  | "control"
  | "decisions"
  | "health"
  | "pacing"
  | "audit"
  | "integrations"
  | "team"
  | "builder"
  | "clients"
  | "historial";

export type Severity = "critical" | "high" | "medium" | "info";
export type HealthState = "critical" | "warning" | "healthy" | "inactive";

export type Decision = {
  id: string;
  severity: Severity;
  client: string;
  platform: string;
  owner: string;
  autonomy: "N0" | "N1" | "N2" | "N3";
  title: string;
  diagnosis: string;
  proposedAction: string;
  impact: string;
  confidence: "Alta" | "Media" | "No estimable";
  agent: string;
  rule: string;
  age: string;
  expires: string;
  before: string;
  after: string;
  guardrail: string;
  metric: string;
  delta: string;
  primaryLabel: string;
  version: number;
};

export type AuditEvent = {
  id: string;
  eventType: string;
  time: string;
  user: string;
  action: string;
  client: string;
  origin: string;
  result: string;
};

export type HealthCheck = {
  check: string;
  /** Cuenta a la que pertenece esta verificación. Un cliente tiene varias. */
  account: string;
  platform: string;
  state: HealthState;
  detail: string;
  lastCheck: string;
  owner: string;
};
