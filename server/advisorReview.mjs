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

const defaultReviewProjection = () => ({ ...defaultReview });

export function projectStoredAdvisorReview(review) {
  if (review === null || typeof review !== "object" || Array.isArray(review)) {
    return defaultReviewProjection();
  }
  if (!reviewStatuses.has(review.status)) return defaultReviewProjection();
  if (typeof review.note !== "string" || review.note !== review.note.trim() || review.note.length > 2000) {
    return defaultReviewProjection();
  }
  if (review.updatedAt !== null && (
    typeof review.updatedAt !== "string"
      || !Number.isFinite(Date.parse(review.updatedAt))
      || new Date(review.updatedAt).toISOString() !== review.updatedAt
  )) {
    return defaultReviewProjection();
  }
  return {
    status: review.status,
    note: review.note,
    updatedAt: review.updatedAt,
  };
}

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

  const projectedCurrent = projectStoredAdvisorReview(current);

  if (input.status === projectedCurrent.status && note === projectedCurrent.note) {
    return {
      status: projectedCurrent.status,
      note: projectedCurrent.note,
      updatedAt: projectedCurrent.updatedAt,
    };
  }

  return {
    status: input.status,
    note,
    updatedAt: now().toISOString(),
  };
}
