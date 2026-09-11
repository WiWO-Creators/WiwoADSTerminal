ALTER TABLE `portfolios` ADD `needs_review` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `portfolios` ADD `review_note` text;
