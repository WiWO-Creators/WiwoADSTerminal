CREATE TABLE `account_metrics_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`integration_account_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`account_name_snapshot` text NOT NULL,
	`metric_date` text NOT NULL,
	`currency` text,
	`spend_micros` integer DEFAULT 0 NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`conversions` real,
	`conversion_value_micros` integer,
	`fetched_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_metrics_account_date` ON `account_metrics_daily` (`integration_account_id`,`metric_date`);--> statement-breakpoint
CREATE INDEX `idx_account_metrics_connection_date` ON `account_metrics_daily` (`connection_id`,`metric_date`);--> statement-breakpoint
CREATE INDEX `idx_account_metrics_provider_account_date` ON `account_metrics_daily` (`provider`,`provider_account_id`,`metric_date`);--> statement-breakpoint
CREATE TABLE `metric_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`selected_account_count` integer DEFAULT 0 NOT NULL,
	`synced_account_count` integer DEFAULT 0 NOT NULL,
	`row_count` integer DEFAULT 0 NOT NULL,
	`range_start` text NOT NULL,
	`range_end` text NOT NULL,
	`data_through` text,
	`error_summary` text,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_metric_sync_runs_connection_started` ON `metric_sync_runs` (`connection_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_metric_sync_runs_status_started` ON `metric_sync_runs` (`status`,`started_at`);--> statement-breakpoint
ALTER TABLE `integration_accounts` ADD `is_available` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_accounts` ADD `is_manager` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_accounts` ADD `metrics_status` text DEFAULT 'not_synced' NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_accounts` ADD `metrics_last_synced_at` integer;--> statement-breakpoint
ALTER TABLE `integration_accounts` ADD `metrics_last_date` text;--> statement-breakpoint
ALTER TABLE `integration_accounts` ADD `metrics_last_error` text;--> statement-breakpoint
CREATE INDEX `idx_integration_accounts_metric_candidates` ON `integration_accounts` (`connection_id`,`selected`,`is_available`,`account_type`,`is_manager`);