-- Store refresh tokens only as SHA-256 hashes. Existing sessions stay valid.
ALTER TABLE "refresh_tokens" ADD COLUMN "token_hash" TEXT;
UPDATE "refresh_tokens" SET "token_hash" = encode(sha256(convert_to("token", 'UTF8')), 'hex');
ALTER TABLE "refresh_tokens" ALTER COLUMN "token_hash" SET NOT NULL;

DROP INDEX "refresh_tokens_token_key";
ALTER TABLE "refresh_tokens" DROP COLUMN "token";

CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
