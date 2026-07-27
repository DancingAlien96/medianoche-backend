-- AlterTable: add gallery column
ALTER TABLE "Product" ADD COLUMN "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: seed the gallery with the existing cover image
UPDATE "Product" SET "images" = ARRAY["imageUrl"] WHERE "imageUrl" <> '';
