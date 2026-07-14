export function shouldRunSaleAnalysis(state, nowMs, minMinutes) {
  if (!state.lastSaleRunAt) return true;
  return nowMs - new Date(state.lastSaleRunAt).getTime() >= minMinutes * 60_000;
}
