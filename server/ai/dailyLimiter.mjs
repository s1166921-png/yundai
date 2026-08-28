export function createDailyLimiter({ limit = 100, now = () => new Date() } = {}) {
  let day = null;
  let count = 0;
  const resetForCurrentDay = () => {
    const currentDay = now().toISOString().slice(0, 10);
    if (day !== currentDay) {
      day = currentDay;
      count = 0;
    }
  };

  return {
    canAcquire() {
      resetForCurrentDay();
      return count < limit;
    },
    tryAcquire() {
      resetForCurrentDay();
      if (count >= limit) return false;
      count += 1;
      return true;
    },
  };
}
