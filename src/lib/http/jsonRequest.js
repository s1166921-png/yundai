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

const postWithFetch = async (fetchImpl, url, data) => {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const payload = parseJson(await response.text());
  if (!response.ok) throw requestError(payload, response.status);
  return payload;
};

const postWithXmlHttpRequest = (XmlHttpRequestImpl, url, data) => new Promise((resolve, reject) => {
  const request = new XmlHttpRequestImpl();
  request.open("POST", url, true);
  request.setRequestHeader("Content-Type", "application/json");
  request.onload = () => {
    const payload = parseJson(request.responseText);
    if (request.status >= 200 && request.status < 300) {
      resolve(payload);
      return;
    }
    reject(requestError(payload, request.status));
  };
  request.onerror = () => reject(requestError({}, 0));
  request.ontimeout = () => reject(requestError({}, 0));
  request.send(JSON.stringify(data));
});

export function postJson(url, data, implementations = {}) {
  const runtime = defaultRuntime();
  const hasFetchOverride = Object.prototype.hasOwnProperty.call(implementations, "fetchImpl");
  const fetchImpl = hasFetchOverride ? implementations.fetchImpl : runtime.fetch;
  const XmlHttpRequestImpl = implementations.XMLHttpRequestImpl ?? runtime.XMLHttpRequest;

  if (typeof fetchImpl === "function") {
    return postWithFetch(fetchImpl.bind ? fetchImpl.bind(runtime) : fetchImpl, url, data);
  }
  if (typeof XmlHttpRequestImpl === "function") {
    return postWithXmlHttpRequest(XmlHttpRequestImpl, url, data);
  }
  return Promise.reject(requestError({}, 0));
}
