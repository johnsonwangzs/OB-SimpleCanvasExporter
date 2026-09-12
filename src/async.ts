/** Promise rejections may contain arbitrary values, including AbortSignal.reason. */
export function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

/** Timers belong to the Canvas window, including canvases opened in a pop-out. */
export function withTimeout<T>(promise: Promise<T>, ms: number, signal: AbortSignal, win: Window): Promise<T> {
  return new Promise((resolve, reject) => {
    let timer: number | undefined;
    let settled = false;
    const done = (finish: () => void) => {
      if (settled) return;
      settled = true;
      win.clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      finish();
    };
    const abort = () => done(() => reject(asError(signal.reason)));
    timer = win.setTimeout(() => done(() => reject(new Error('Rendering timed out.'))), ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    // Always handle the underlying promise, even if cancellation wins the race.
    promise.then(value => done(() => resolve(value)), (error: unknown) => done(() => reject(asError(error))));
  });
}
