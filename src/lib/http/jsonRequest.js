const parseJson = (text) => {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const requestError = (payload, status) => {
  const error = new Error(payload.error || "提交失败，请稍后再试");
  error.fields = payload.errors;
  error.status = status;
  return error;
};

const defaultRuntime = () => {
  if (typeof window !== "undefined") return window;
  if (typeof globalThis !== "undefined") return globalThis;
  return {};
};

const requestWithFetch = async (fetchImpl, url, method, data, signal) => {
  const options = method === "GET"
    ? { method, ...(signal == null ? {} : { signal }) }
    : {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        ...(signal == null ? {} : { signal }),
      };
  const response = await fetchImpl(url, options);
  const payload = parseJson(await response.text());
  if (!response.ok) throw requestError(payload, response.status);
  return payload;
};

const requestWithXmlHttpRequest = (XmlHttpRequestImpl, url, method, data, signal) => new Promise((resolve, reject) => {
  const request = new XmlHttpRequestImpl();
  let settled = false;
  const abortError = () => {
    const error = new Error("请求已取消");
    error.name = "AbortError";
    return error;
  };
  const finish = (callback) => (value) => {
    if (settled) return;
    settled = true;
    signal?.removeEventListener?.("abort", abortRequest);
    callback(value);
  };
  const resolveOnce = finish(resolve);
  const rejectOnce = finish(reject);
  const abortRequest = () => {
    request.abort?.();
    rejectOnce(abortError());
  };

  if (signal?.aborted) {
    rejectOnce(abortError());
    return;
  }
  signal?.addEventListener?.("abort", abortRequest, { once: true });
  request.open(method, url, true);
  if (method !== "GET") request.setRequestHeader("Content-Type", "application/json");
  request.onload = () => {
    const payload = parseJson(request.responseText);
    if (request.status >= 200 && request.status < 300) {
      resolveOnce(payload);
      return;
    }
    rejectOnce(requestError(payload, request.status));
  };
  request.onerror = () => rejectOnce(requestError({}, 0));
  request.ontimeout = () => rejectOnce(requestError({}, 0));
  request.onabort = () => rejectOnce(abortError());
  request.send(method === "GET" ? undefined : JSON.stringify(data));
});

const requestJson = (url, method, data, implementations = {}) => {
  const runtime = defaultRuntime();
  const hasFetchOverride = Object.prototype.hasOwnProperty.call(implementations, "fetchImpl");
  const fetchImpl = hasFetchOverride ? implementations.fetchImpl : runtime.fetch;
  const XmlHttpRequestImpl = implementations.XMLHttpRequestImpl ?? runtime.XMLHttpRequest;

  if (typeof fetchImpl === "function") {
    return requestWithFetch(fetchImpl.bind ? fetchImpl.bind(runtime) : fetchImpl, url, method, data, implementations.signal);
  }
  if (typeof XmlHttpRequestImpl === "function") {
    return requestWithXmlHttpRequest(XmlHttpRequestImpl, url, method, data, implementations.signal);
  }
  return Promise.reject(requestError({}, 0));
};

export function getJson(url, implementations = {}) {
  return requestJson(url, "GET", undefined, implementations);
}

export function postJson(url, data, implementations = {}) {
  return requestJson(url, "POST", data, implementations);
}
