import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});
const metrics = await vite.ssrLoadModule("/lib/provider-metrics.ts");

after(async () => {
  await vite.close();
});

test("maps Google Ads daily metrics with exact micros and manager context", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls += 1;
    const url = String(input);
    assert.match(url, /v25\/customers\/1234567890\/googleAds:searchStream$/);
    assert.equal(init?.method, "POST");
    assert.equal(init?.headers?.["developer-token"], "developer-token");
    assert.equal(init?.headers?.["login-customer-id"], "9876543210");
    const body = JSON.parse(String(init?.body));
    assert.match(body.query, /segments\.date/);
    assert.match(body.query, /2026-09-01/);
    return Response.json([
      {
        results: [
          {
            segments: { date: "2026-09-03" },
            customer: { currencyCode: "CLP" },
            metrics: {
              costMicros: "48200500000",
              impressions: "100000",
              clicks: "2500",
              conversions: "120.5",
              conversionsValue: "77000.25",
            },
          },
        ],
      },
    ]);
  };

  try {
    const rows = await metrics.fetchGoogleDailyAccountMetrics({
      accessToken: "access-token",
      account: {
        integrationAccountId: "acc-1",
        externalId: "123-456-7890",
        name: "Example Ads",
        currency: "CLP",
        managerId: "987-654-3210",
      },
      range: { start: "2026-09-01", end: "2026-09-05" },
      developerToken: "developer-token",
      apiVersion: "v25",
    });

    assert.equal(calls, 1);
    assert.deepEqual(rows, [
      {
        metricDate: "2026-09-03",
        currency: "CLP",
        spendMicros: 48200500000,
        impressions: 100000,
        clicks: 2500,
        conversions: 120.5,
        conversionValueMicros: 77000250000,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("paginates Meta without putting the access token in the URL", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requestedUrls.push(url.toString());
    assert.equal(init?.headers?.authorization, "Bearer meta-secret-token");
    if (requestedUrls.length === 1) {
      assert.equal(url.searchParams.get("access_token"), null);
      assert.equal(url.searchParams.get("appsecret_proof"), "proof");
      return Response.json({
        data: [
          {
            date_start: "2026-09-03",
            spend: "48200.50",
            impressions: "100000",
            clicks: "2500",
            actions: [
              { action_type: "purchase", value: "120" },
              {
                action_type: "offsite_conversion.fb_pixel_purchase",
                value: "120",
              },
              { action_type: "lead", value: "50" },
            ],
            action_values: [
              {
                action_type: "offsite_conversion.fb_pixel_purchase",
                value: "77000.25",
              },
            ],
          },
        ],
        paging: {
          next:
            "https://graph.facebook.com/v26.0/next?after=cursor&access_token=meta-secret-token&appsecret_proof=proof",
        },
      });
    }
    assert.equal(url.searchParams.get("access_token"), null);
    assert.equal(url.searchParams.get("after"), "cursor");
    return Response.json({
      data: [
        {
          date_start: "2026-09-04",
          spend: "0",
          impressions: "0",
          clicks: "0",
        },
      ],
    });
  };

  try {
    const rows = await metrics.fetchMetaDailyAccountMetrics({
      accessToken: "meta-secret-token",
      appSecretProof: "proof",
      account: {
        integrationAccountId: "acc-2",
        externalId: "act_12345",
        name: "Meta account",
        currency: "USD",
        managerId: null,
      },
      range: { start: "2026-09-01", end: "2026-09-05" },
      graphVersion: "v26.0",
    });

    assert.equal(requestedUrls.length, 2);
    assert.equal(rows[0].spendMicros, 48200500000);
    assert.equal(rows[0].conversions, null);
    assert.equal(rows[0].conversionValueMicros, null);
    assert.equal(rows[1].conversions, null);
    assert.equal(rows[1].conversionValueMicros, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects Meta paging URLs outside Graph API before forwarding credentials", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({
      data: [],
      paging: { next: "https://example.com/collect?access_token=secret" },
    });
  };

  try {
    await assert.rejects(
      metrics.fetchMetaDailyAccountMetrics({
        accessToken: "meta-secret-token",
        appSecretProof: "proof",
        account: {
          integrationAccountId: "acc-3",
          externalId: "12345",
          name: "Meta account",
          currency: "USD",
          managerId: null,
        },
        range: { start: "2026-09-01", end: "2026-09-05" },
        graphVersion: "v26.0",
      }),
      /fuera de Graph API/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
