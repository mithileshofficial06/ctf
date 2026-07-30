import { test } from "node:test";
import assert from "node:assert/strict";
import { COSMOS_THROTTLE_CODE, withThrottleRetry } from "./retry";

function throttled() {
  return Object.assign(new Error("Request rate is large"), { code: COSMOS_THROTTLE_CODE });
}

test("returns the value when the operation succeeds first time", async () => {
  const result = await withThrottleRetry(async () => "ok");
  assert.equal(result, "ok");
});

test("retries on 16500 and returns the eventual success", async () => {
  let calls = 0;
  const result = await withThrottleRetry(
    async () => {
      calls++;
      if (calls < 3) throw throttled();
      return "ok";
    },
    { baseDelayMs: 1 }
  );

  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("does NOT retry other errors — a real failure must not be hidden", async () => {
  let calls = 0;
  await assert.rejects(
    withThrottleRetry(async () => {
      calls++;
      throw Object.assign(new Error("duplicate key"), { code: 11000 });
    }, { baseDelayMs: 1 }),
    /duplicate key/
  );
  assert.equal(calls, 1, "a non-throttle error should be thrown immediately");
});

test("gives up after the attempt budget and rethrows the throttle error", async () => {
  let calls = 0;
  await assert.rejects(
    withThrottleRetry(
      async () => {
        calls++;
        throw throttled();
      },
      { attempts: 3, baseDelayMs: 1 }
    ),
    /Request rate is large/
  );
  assert.equal(calls, 3);
});

test("honours Cosmos's own RetryAfterMs when supplied", async () => {
  let calls = 0;
  const started = Date.now();

  await withThrottleRetry(
    async () => {
      calls++;
      if (calls === 1) {
        throw Object.assign(new Error("throttled"), {
          code: COSMOS_THROTTLE_CODE,
          RetryAfterMs: 40,
        });
      }
      return "ok";
    },
    { baseDelayMs: 1 }
  );

  assert.ok(Date.now() - started >= 40, "should wait at least the advised delay");
});
