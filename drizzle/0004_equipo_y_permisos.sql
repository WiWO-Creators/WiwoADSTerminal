CREATE TABLE `user_portfolios` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`portfolio_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_portfolios_user_portfolio` ON `user_portfolios` (`user_id`,`portfolio_id`);--> statement-breakpoint
CREATE INDEX `idx_user_portfolios_user` ON `user_portfolios` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `invited_by` text;--> statement-breakpoint
ALTER TABLE `users` ADD `invited_at` integer;
