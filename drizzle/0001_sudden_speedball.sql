CREATE TABLE `integration_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`account_type` text DEFAULT 'ads' NOT NULL,
	`name` text NOT NULL,
	`currency` text,
	`account_status` text,
	`manager_account_id` text,
	`timezone` text,
	`selected` integer DEFAULT false NOT NULL,
	`discovered_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integration_accounts_connection_external` ON `integration_accounts` (`connection_id`,`provider_account_id`,`account_type`);--> statement-breakpoint
CREATE INDEX `idx_integration_accounts_connection_selected` ON `integration_accounts` (`connection_id`,`selected`);--> statement-breakpoint
CREATE TABLE `integration_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`provider_user_id` text,
	`provider_user_name` text,
	`scopes` text DEFAULT '' NOT NULL,
	`token_ciphertext` text NOT NULL,
	`token_expires_at` integer,
	`last_sync_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integration_connections_user_provider` ON `integration_connections` (`user_id`,`provider`);--> statement-breakpoint
CREATE INDEX `idx_integration_connections_status` ON `integration_connections` (`status`);--> statement-breakpoint
CREATE TABLE `oauth_sessions` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`code_verifier_ciphertext` text,
	`redirect_uri` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_oauth_sessions_user_provider` ON `oauth_sessions` (`user_id`,`provider`);--> statement-breakpoint
CREATE INDEX `idx_oauth_sessions_expires_at` ON `oauth_sessions` (`expires_at`);