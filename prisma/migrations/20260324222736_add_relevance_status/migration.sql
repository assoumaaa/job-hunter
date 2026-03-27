-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "url" TEXT,
    "salary" TEXT,
    "jobType" TEXT,
    "source" TEXT DEFAULT 'apify',
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relevanceStatus" TEXT NOT NULL DEFAULT 'unscreened',
    "agentStatus" TEXT NOT NULL DEFAULT 'pending',
    "atsScore" INTEGER,
    "atsBreakdown" TEXT,
    "applicationStatus" TEXT NOT NULL DEFAULT 'new',
    "applicationDate" DATETIME,
    "generatedCv" TEXT,
    "generatedCl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("agentStatus", "applicationDate", "applicationStatus", "atsBreakdown", "atsScore", "company", "createdAt", "description", "fetchedAt", "generatedCl", "generatedCv", "id", "jobType", "location", "salary", "source", "title", "updatedAt", "url", "userId") SELECT "agentStatus", "applicationDate", "applicationStatus", "atsBreakdown", "atsScore", "company", "createdAt", "description", "fetchedAt", "generatedCl", "generatedCv", "id", "jobType", "location", "salary", "source", "title", "updatedAt", "url", "userId" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
