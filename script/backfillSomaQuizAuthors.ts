import { db } from "../server/db";
import { somaQuizzes } from "../shared/schema";
import { and, eq, isNull } from "drizzle-orm";

async function main() {
  if (!db) {
    throw new Error("Database is not configured");
  }

  const defaultAuthorId = process.env.SOMA_DEFAULT_TUTOR_ID;
  if (!defaultAuthorId) {
    throw new Error("Set SOMA_DEFAULT_TUTOR_ID before running this script");
  }

  const updated = await db.update(somaQuizzes)
    .set({ authorId: defaultAuthorId })
    .where(and(isNull(somaQuizzes.authorId), eq(somaQuizzes.isArchived, false)))
    .returning({ id: somaQuizzes.id });

  console.log(`Backfilled author_id on ${updated.length} quizzes.`);
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
