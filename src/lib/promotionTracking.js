import { readPromotionRef } from './promotionRef.js';
const documents = new WeakMap();

// A document is one page view. No browser identity or cross-device tracking.
export function startPromotionTracking({ windowObject = window, documentObject = document, fetchImpl = fetch } = {}) {
  try {
    let state = documents.get(documentObject);
    if (!state) {
      const ref = readPromotionRef(windowObject.location.search);
      if (!ref || !windowObject.crypto?.getRandomValues) return () => {};
      state = { ref, attempts: 0, body: null, inFlight: false, done: false, users: 0, timer: null };
      documents.set(documentObject, state);
    }
    state.users += 1;
    let stopped = false;
    const schedule = () => {
      if (!state.done && state.users > 0 && state.attempts < 2 && state.timer == null) {
        state.timer = windowObject.setTimeout(() => { state.timer = null; send(); }, 1000);
      }
    };
    const send = () => {
      if (state.done || state.inFlight || !state.users || documentObject.visibilityState !== "visible" || state.attempts >= 2) return;
      try {
        if (!state.body) {
          const bytes = windowObject.crypto.getRandomValues(new Uint8Array(16));
          const suffix = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
          state.body = JSON.stringify({ ref: state.ref, eventId: Date.now() + "-" + suffix, eventType: "page_view" });
        }
        state.attempts += 1; state.inFlight = true;
        Promise.resolve().then(() => fetchImpl("/api/promotion/events", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: state.body,
        })).then(response => {
          if (response.status < 500) state.done = true;
        }, () => {}).finally(() => {
          state.inFlight = false;
          if (state.attempts >= 2) state.done = true;
          schedule();
        });
      } catch { state.done = true; state.inFlight = false; }
    };
    documentObject.addEventListener("visibilitychange", send);
    if (state.attempts > 0 && !state.inFlight) schedule(); else send();
    return () => {
      if (stopped) return;
      stopped = true; state.users -= 1;
      documentObject.removeEventListener("visibilitychange", send);
      if (!state.users && state.timer != null) { windowObject.clearTimeout(state.timer); state.timer = null; }
    };
  } catch { return () => {}; }
}
