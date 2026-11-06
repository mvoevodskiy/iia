/** Presentation requests may fail quietly; never retry an obsolete animation. */
const presentationSignals = new WeakSet();
export function presentationSignal(signal) {
  presentationSignals.add(signal);
  return signal;
}
export function presentationAwareRetry(retry) {
  return (previous, method, payload, signal) => presentationSignals.has(signal)
    ? previous(method, payload, signal)
    : retry(previous, method, payload, signal);
}
