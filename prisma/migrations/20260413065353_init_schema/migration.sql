-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "fullName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MockTest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "totalQuestions" INTEGER NOT NULL DEFAULT 200,
    "durationSec" INTEGER NOT NULL DEFAULT 7200,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mockTestId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "durationSec" INTEGER,
    "instruction" TEXT,
    CONSTRAINT "Section_mockTestId_fkey" FOREIGN KEY ("mockTestId") REFERENCES "MockTest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "instruction" TEXT,
    CONSTRAINT "Part_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "partId" TEXT NOT NULL,
    "orderNo" INTEGER NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "stem" TEXT NOT NULL,
    "explanation" TEXT,
    "correctChoiceId" TEXT,
    CONSTRAINT "Question_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Choice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Choice_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "mockTestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" DATETIME,
    "remainingTimeSec" INTEGER NOT NULL,
    "lastActivityAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attempt_mockTestId_fkey" FOREIGN KEY ("mockTestId") REFERENCES "MockTest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AttemptAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "choiceId" TEXT,
    "answeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AttemptAnswer_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "Choice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Result" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Result_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Result_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "sectionId" TEXT,
    "partId" TEXT,
    "questionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MediaAsset_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MediaAsset_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MockTest_slug_key" ON "MockTest"("slug");

-- CreateIndex
CREATE INDEX "MockTest_status_createdAt_idx" ON "MockTest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Section_mockTestId_type_idx" ON "Section"("mockTestId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Section_mockTestId_orderNo_key" ON "Section"("mockTestId", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "Part_sectionId_orderNo_key" ON "Part"("sectionId", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "Question_partId_orderNo_key" ON "Question"("partId", "orderNo");

-- CreateIndex
CREATE UNIQUE INDEX "Question_partId_questionNumber_key" ON "Question"("partId", "questionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Choice_questionId_label_key" ON "Choice"("questionId", "label");

-- CreateIndex
CREATE INDEX "Attempt_userId_mockTestId_status_idx" ON "Attempt"("userId", "mockTestId", "status");

-- CreateIndex
CREATE INDEX "AttemptAnswer_attemptId_answeredAt_idx" ON "AttemptAnswer"("attemptId", "answeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptAnswer_attemptId_questionId_key" ON "AttemptAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Result_attemptId_key" ON "Result"("attemptId");
