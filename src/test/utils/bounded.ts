/* istanbul ignore file -- This helper is test infrastructure, not adapter code. */

// A generous bound distinguishes a hung request from a slow test runner.
const TEST_SETTLE_BOUND_MS = 5000

export const bounded = async <T>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('request timed out')),
          TEST_SETTLE_BOUND_MS
        )
      })
    ])
  } finally {
    clearTimeout(timer!)
  }
}
