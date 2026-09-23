export function readPromotionRef(search) {
  try {
    const refs = new URLSearchParams(search).getAll('ref');
    return refs.length === 1 && /^[a-f0-9]{32}$/.test(refs[0]) ? refs[0] : null;
  } catch { return null; }
}
