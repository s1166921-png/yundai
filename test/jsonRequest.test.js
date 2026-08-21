import test from "node:test";
import assert from "node:assert/strict";
import { getJson, postJson } from "../src/lib/http/jsonRequest.js";

class FakeXmlHttpRequest {
  static responses = [];
  static instances = [];

  constructor() {
    this.headers = {};
    FakeXmlHttpRequest.instances.push(this);
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name, value) {
    this.headers[name] = value;
  }

  send(body) {
    this.body = body;
    const response = FakeXmlHttpRequest.responses.shift();
    queueMicrotask(() => {
      this.status = response.status;
      this.responseText = response.body;
      this.onload();
    });
  }
}

test("postJson prefers fetch and returns parsed JSON", async () => {
  const calls = [];
  const result = await postJson("/api/leads", { companyName: "美鸥" }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ ok: true, lead: { id: "lead-1" } }),
      };
    },
    XMLHttpRequestImpl: FakeXmlHttpRequest,
  });

  assert.equal(result.lead.id, "lead-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { companyName: "美鸥" });
});

test("getJson prefers fetch and issues a GET without a request body", async () => {
  const calls = [];
  const result = await getJson("/api/products", {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ products: [{ id: "safe-product" }] }),
      };
    },
    XMLHttpRequestImpl: FakeXmlHttpRequest,
  });

  assert.equal(result.products[0].id, "safe-product");
  assert.deepEqual(calls, [{ url: "/api/products", options: { method: "GET" } }]);
});

test("getJson falls back to XMLHttpRequest when fetch is unavailable", async () => {
  FakeXmlHttpRequest.responses.push({
    status: 200,
    body: JSON.stringify({ products: [{ id: "xhr-product" }] }),
  });

  const result = await getJson("/api/products", {
    fetchImpl: undefined,
    XMLHttpRequestImpl: FakeXmlHttpRequest,
  });
  const request = FakeXmlHttpRequest.instances.at(-1);

  assert.equal(result.products[0].id, "xhr-product");
  assert.equal(request.method, "GET");
  assert.equal(request.url, "/api/products");
  assert.equal(request.body, undefined);
});

test("postJson falls back to XMLHttpRequest when fetch is unavailable", async () => {
  FakeXmlHttpRequest.responses.push({
    status: 201,
    body: JSON.stringify({ ok: true, lead: { id: "xhr-lead" } }),
  });

  const result = await postJson("/api/leads", { estimationMode: "simple" }, {
    fetchImpl: undefined,
    XMLHttpRequestImpl: FakeXmlHttpRequest,
  });
  const request = FakeXmlHttpRequest.instances.at(-1);

  assert.equal(result.lead.id, "xhr-lead");
  assert.equal(request.method, "POST");
  assert.equal(request.url, "/api/leads");
  assert.equal(request.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request.body), { estimationMode: "simple" });
});

test("postJson preserves JSON error messages and field errors in the XHR fallback", async () => {
  FakeXmlHttpRequest.responses.push({
    status: 400,
    body: JSON.stringify({
      error: "提交信息有误",
      errors: [{ field: "consentToDataUse", message: "must be accepted" }],
    }),
  });

  await assert.rejects(
    postJson("/api/leads", {}, {
      fetchImpl: undefined,
      XMLHttpRequestImpl: FakeXmlHttpRequest,
    }),
    (error) => {
      assert.equal(error.message, "提交信息有误");
      assert.deepEqual(error.fields, [{ field: "consentToDataUse", message: "must be accepted" }]);
      assert.equal(error.status, 400);
      return true;
    },
  );
});
