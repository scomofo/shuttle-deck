/** Format the root simulation's GMT event time for the F7 event timer. */
export function formatEventTime(getSeconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(Number.isFinite(getSeconds) ? getSeconds : 0));
  const days = Math.floor(wholeSeconds / 86400);
  const hours = Math.floor((wholeSeconds % 86400) / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const seconds = wholeSeconds % 60;
  const twoDigits = (value: number) => String(value).padStart(2, "0");
  return `${String(days).padStart(3, "0")}:${twoDigits(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)}`;
}
