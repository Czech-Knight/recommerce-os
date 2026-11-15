import { test } from "node:test";
import assert from "node:assert/strict";
import { appUrl, configuredAppUrl } from "../src/lib/config";
import { sameOrigin } from "../src/lib/auth";

function withHostingEnv(
  values: Record<string, string | undefined>,
  run: () => void,
) {
  const previous = new Map(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const request = (origin: string) =>
  new Request("http://internal:10000/api/checkout", {
    headers: { origin },
  });

test("hosted HTTPS origin works behind Render's HTTP proxy and rejects localhost", () => {
  withHostingEnv(
    {
      DEMO_MODE: "true",
      APP_URL: undefined,
      RENDER_EXTERNAL_URL: "https://demo.onrender.com",
    },
    () => {
      assert.equal(appUrl(), "https://demo.onrender.com");
      sameOrigin(request("https://demo.onrender.com"));
      for (const origin of [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "https://attacker.example",
        "http://demo.onrender.com",
      ]) {
        assert.throws(
          () => sameOrigin(request(origin)),
          /Invalid request origin/,
        );
      }
    },
  );
});

test("explicit custom domain overrides the hosting provider URL", () => {
  withHostingEnv(
    {
      APP_URL: "https://shop.example",
      RENDER_EXTERNAL_URL: "https://demo.onrender.com",
    },
    () => {
      assert.equal(appUrl(), "https://shop.example");
      sameOrigin(request("https://shop.example"));
      assert.throws(
        () => sameOrigin(request("https://demo.onrender.com")),
        /Invalid request origin/,
      );
    },
  );
});

test("local demo keeps its loopback origin support without a hosting URL", () => {
  withHostingEnv(
    { DEMO_MODE: "true", APP_URL: undefined, RENDER_EXTERNAL_URL: undefined },
    () => {
      assert.equal(configuredAppUrl(), undefined);
      assert.equal(appUrl(), "http://localhost:3000");
      sameOrigin(request("http://127.0.0.1:3000"));
      sameOrigin(request("http://localhost:3000"));
    },
  );
});
