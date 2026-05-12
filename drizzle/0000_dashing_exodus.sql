CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`timezone` text DEFAULT 'America/Los_Angeles' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`condition` text DEFAULT 'good' NOT NULL,
	`inventory` integer DEFAULT 1 NOT NULL,
	`current_price_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_store_sku_idx` ON `items` (`store_id`,`sku`);--> statement-breakpoint
CREATE INDEX `items_store_idx` ON `items` (`store_id`);--> statement-breakpoint
CREATE INDEX `items_category_idx` ON `items` (`category`);--> statement-breakpoint
CREATE TABLE `price_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`from_price_cents` integer NOT NULL,
	`to_price_cents` integer NOT NULL,
	`reason` text NOT NULL,
	`rule_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`proposed_at` integer NOT NULL,
	`proposed_by` text,
	`decided_at` integer,
	`decided_by` text,
	`applied_at` integer,
	`note` text,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rule_id`) REFERENCES `pricing_rules`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`proposed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `price_changes_item_idx` ON `price_changes` (`item_id`);--> statement-breakpoint
CREATE INDEX `price_changes_status_idx` ON `price_changes` (`status`);--> statement-breakpoint
CREATE INDEX `price_changes_proposed_at_idx` ON `price_changes` (`proposed_at`);--> statement-breakpoint
CREATE TABLE `sales_events` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`store_id` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`sold_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sales_events_item_sold_at_idx` ON `sales_events` (`item_id`,`sold_at`);--> statement-breakpoint
CREATE INDEX `sales_events_store_sold_at_idx` ON `sales_events` (`store_id`,`sold_at`);--> statement-breakpoint
CREATE TABLE `pricing_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`conditions` text NOT NULL,
	`action` text NOT NULL,
	`priority` integer DEFAULT 100 NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pricing_rules_enabled_priority_idx` ON `pricing_rules` (`enabled`,`priority`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`actor_id` text,
	`payload` text NOT NULL,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_events_occurred_at_idx` ON `audit_events` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_events_entity_idx` ON `audit_events` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_events_event_type_idx` ON `audit_events` (`event_type`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'manager' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);