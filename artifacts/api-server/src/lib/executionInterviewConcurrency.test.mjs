import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(new URL("../../../../lib/db/src/index.ts", import.meta.url));
const { Pool } = require("pg");

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("an interview row lock lets only one concurrent request reach the provider", {
  skip: !process.env.DATABASE_URL,
}, async (t) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ownerId = `execution-interview-concurrency-test-${process.pid}-${Date.now()}`;
  const inserted = await pool.query(
    `INSERT INTO execution_interviews (owner_id, status, question_index, current_question, messages)
     VALUES ($1, 'active', 1, 'Test question', '[]'::jsonb)
     RETURNING id`,
    [ownerId],
  );
  const interviewId = inserted.rows[0].id;
  const firstClient = await pool.connect();
  const secondClient = await pool.connect();

  t.after(async () => {
    await firstClient.query("ROLLBACK").catch(() => {});
    await secondClient.query("ROLLBACK").catch(() => {});
    firstClient.release();
    secondClient.release();
    await pool.query("DELETE FROM execution_interviews WHERE id = $1", [interviewId]);
    await pool.end();
  });

  try {
    // Both requests read the same active question before either starts its
    // transaction, matching the route's initial ownership/status lookup.
    const firstSnapshot = await firstClient.query(
      "SELECT question_index, current_question FROM execution_interviews WHERE id = $1",
      [interviewId],
    );
    const secondSnapshot = await secondClient.query(
      "SELECT question_index, current_question FROM execution_interviews WHERE id = $1",
      [interviewId],
    );
    assert.deepEqual(firstSnapshot.rows[0], secondSnapshot.rows[0]);

    await firstClient.query("BEGIN");
    await firstClient.query(
      "SELECT id FROM execution_interviews WHERE id = $1 FOR UPDATE",
      [interviewId],
    );

    let providerCalls = 1;
    await secondClient.query("BEGIN");
    const secondClaim = secondClient.query(
      "SELECT question_index, current_question FROM execution_interviews WHERE id = $1 FOR UPDATE",
      [interviewId],
    );

    // Keep the first transaction open long enough for the second request to
    // block on the same row lock, just as it does while Gemini is running.
    await wait(25);
    await firstClient.query(
      `UPDATE execution_interviews
       SET question_index = 2, current_question = 'Next question'
       WHERE id = $1`,
      [interviewId],
    );
    await firstClient.query("COMMIT");

    const secondClaimedRow = (await secondClaim).rows[0];
    const sameQuestionStillActive =
      secondClaimedRow.question_index === firstSnapshot.rows[0].question_index
      && secondClaimedRow.current_question === firstSnapshot.rows[0].current_question;
    if (sameQuestionStillActive) providerCalls += 1;

    assert.equal(secondClaimedRow.question_index, 2);
    assert.equal(secondClaimedRow.current_question, "Next question");
    assert.equal(providerCalls, 1);
    await secondClient.query("ROLLBACK");
  } finally {
    await firstClient.query("ROLLBACK").catch(() => {});
    await secondClient.query("ROLLBACK").catch(() => {});
  }
});