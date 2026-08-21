import test from "node:test";
import assert from "node:assert/strict";
import { postJson } from "../src/lib/http/jsonRequest.js";

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
