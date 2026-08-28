const reviewStatuses = new Set([
  "pending",
  "in_review",
  "reviewed",
  "needs_information",
]);

const defaultReview = Object.freeze({
  status: "pending",
  note: "",
  updatedAt: null,
});

export function normalizeAdvisorReview(
  input,
  current = defaultReview,
  now = () => new Date(),
) {
  if (!reviewStatuses.has(input?.status)) {
    throw new TypeError("review status is invalid");
  }
  if (typeof input.note !== "string") {
    throw new TypeError("review note must be a string");
  }

  const note = input.note.trim();
  if (note.length > 2000) {
    throw new RangeError("review note must be at most 2000 characters");
  }

  if (input.status === current?.status && note === current?.note) {
    return {
      status: current.status,
      note: current.note,
      updatedAt: current.updatedAt ?? null,
    };
  }

  return {
    status: input.status,
    note,
    updatedAt: now().toISOString(),
  };
}
