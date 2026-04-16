-- Per-user chat history (single JSONB messages column per conversation).

CREATE TABLE "chat_conversations" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "org_id" UUID,
    "title" TEXT NOT NULL,
    "skill_id" UUID,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("conversation_id")
);

CREATE INDEX "chat_conversations_user_id_updated_at_idx"
    ON "chat_conversations"("user_id", "updated_at" DESC);

ALTER TABLE "chat_conversations"
    ADD CONSTRAINT "chat_conversations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("user_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
