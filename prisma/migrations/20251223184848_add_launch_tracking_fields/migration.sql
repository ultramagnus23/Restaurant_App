-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MenuItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "costPrice" REAL NOT NULL,
    "sellingPrice" REAL NOT NULL,
    "baseElasticity" REAL NOT NULL DEFAULT 1.2,
    "launchDate" DATETIME,
    "prepTime" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_MenuItem" ("baseElasticity", "category", "costPrice", "id", "name", "sellingPrice") SELECT "baseElasticity", "category", "costPrice", "id", "name", "sellingPrice" FROM "MenuItem";
DROP TABLE "MenuItem";
ALTER TABLE "new_MenuItem" RENAME TO "MenuItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
