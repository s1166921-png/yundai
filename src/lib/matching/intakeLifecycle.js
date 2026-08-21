export const INTAKE_INVALIDATION_REASONS = Object.freeze([
  "field_change",
  "mode_change",
  "submit_start",
  "submit_failure",
]);

export function invalidateIntakeResult(onInvalidate, reason) {
  if (!INTAKE_INVALIDATION_REASONS.includes(reason)) return false;
  if (typeof onInvalidate === "function") onInvalidate(reason);
  return true;
}
