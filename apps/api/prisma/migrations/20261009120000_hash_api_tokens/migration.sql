-- Store API tokens only as SHA-256 hashes. Existing tokens keep working.
ALTER TABLE "api_tokens" ADD COLUMN "token_hash" TEXT;
ALTER TABLE "api_tokens" ADD COLUMN "token_prefix" TEXT;

UPDATE "api_tokens"
SET "token_hash" = encode(sha256(convert_to("token", 'UTF8')), 'hex'),
    "token_prefix" = left("token", 12);

ALTER TABLE "api_tokens" ALTER COLUMN "token_hash" SET NOT NULL;
ALTER TABLE "api_tokens" ALTER COLUMN "token_prefix" SET NOT NULL;

DROP INDEX "api_tokens_token_key";
ALTER TABLE "api_tokens" DROP COLUMN "token";

CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens"("token_hash");
