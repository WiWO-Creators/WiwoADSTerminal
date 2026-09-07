CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`decision_id` text,
	`actor_user_id` text,
	`actor_name_snapshot` text NOT NULL,
	`actor_email_snapshot` text,
	`event_type` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`action_label` text NOT NULL,
	`result` text NOT NULL,
	`reason` text,
	`client_snapshot` text NOT NULL,
	`origin_snapshot` text NOT NULL,
	`changes_json` text DEFAULT '{}' NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_audit_events_idempotency` ON `audit_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_decision_created` ON `audit_events` (`decision_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_created_at` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`severity` text NOT NULL,
	`client` text NOT NULL,
	`platform` text NOT NULL,
	`owner_label` text NOT NULL,
	`autonomy` text NOT NULL,
	`title` text NOT NULL,
	`diagnosis` text NOT NULL,
	`proposed_action` text NOT NULL,
	`impact` text NOT NULL,
	`confidence` text NOT NULL,
	`agent` text NOT NULL,
	`rule` text NOT NULL,
	`age_label` text NOT NULL,
	`expires_label` text NOT NULL,
	`before_value` text NOT NULL,
	`after_value` text NOT NULL,
	`guardrail` text NOT NULL,
	`metric` text NOT NULL,
	`delta` text NOT NULL,
	`primary_label` text NOT NULL,
	`generated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`snoozed_until` integer,
	`resolved_at` integer,
	`resolved_by_user_id` text,
	`discard_reason` text,
	`execution_status` text DEFAULT 'not_requested' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_decisions_status_severity_generated` ON `decisions` (`status`,`severity`,`generated_at`);--> statement-breakpoint
CREATE INDEX `idx_decisions_client_status` ON `decisions` (`client`,`status`);--> statement-breakpoint
CREATE INDEX `idx_decisions_expires_at` ON `decisions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'buyer' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);