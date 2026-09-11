CREATE TABLE `portfolios` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`page_id` text,
	`instagram_id` text,
	`countries` text DEFAULT '' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_portfolios_name` ON `portfolios` (`name`);--> statement-breakpoint
CREATE TABLE `portfolio_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`portfolio_id` text NOT NULL,
	`external_id` text NOT NULL,
	`provider` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_portfolio_accounts_external` ON `portfolio_accounts` (`external_id`);--> statement-breakpoint
CREATE INDEX `idx_portfolio_accounts_portfolio` ON `portfolio_accounts` (`portfolio_id`);
