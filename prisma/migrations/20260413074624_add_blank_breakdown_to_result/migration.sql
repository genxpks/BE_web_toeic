-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Result" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "listeningRaw" INTEGER NOT NULL DEFAULT 0,
    "readingRaw" INTEGER NOT NULL DEFAULT 0,
    "listeningScaled" INTEGER NOT NULL DEFAULT 0,
    "readingScaled" INTEGER NOT NULL DEFAULT 0,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "blankCount" INTEGER NOT NULL DEFAULT 0,
    "listeningBlank" INTEGER NOT NULL DEFAULT 0,
    "readingBlank" INTEGER NOT NULL DEFAULT 0,
    "breakdownJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Result_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Result_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Result" ("attemptId", "blankCount", "correctCount", "createdAt", "id", "listeningRaw", "listeningScaled", "readingRaw", "readingScaled", "totalScore", "userId", "wrongCount") SELECT "attemptId", "blankCount", "correctCount", "createdAt", "id", "listeningRaw", "listeningScaled", "readingRaw", "readingScaled", "totalScore", "userId", "wrongCount" FROM "Result";
DROP TABLE "Result";
ALTER TABLE "new_Result" RENAME TO "Result";
CREATE UNIQUE INDEX "Result_attemptId_key" ON "Result"("attemptId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
