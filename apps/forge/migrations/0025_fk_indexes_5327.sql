CREATE INDEX `agents_role_id_idx` ON `agents` (`role_id`);--> statement-breakpoint
CREATE INDEX `agents_model_profile_id_idx` ON `agents` (`model_profile_id`);--> statement-breakpoint
CREATE INDEX `agents_om_model_profile_id_idx` ON `agents` (`om_model_profile_id`);--> statement-breakpoint
CREATE INDEX `webhook_routes_agent_id_idx` ON `webhook_routes` (`agent_id`);--> statement-breakpoint
CREATE INDEX `webhook_events_route_id_idx` ON `webhook_events` (`route_id`);--> statement-breakpoint
CREATE INDEX `webhook_events_agent_id_idx` ON `webhook_events` (`agent_id`);--> statement-breakpoint
CREATE INDEX `knowledge_documents_owner_agent_id_idx` ON `knowledge_documents` (`owner_agent_id`);--> statement-breakpoint
CREATE INDEX `forge_internal_chat_conversations_created_by_account_id_idx` ON `forge_internal_chat_conversations` (`created_by_account_id`);--> statement-breakpoint
CREATE INDEX `forge_internal_chat_messages_author_account_id_idx` ON `forge_internal_chat_messages` (`author_account_id`);
