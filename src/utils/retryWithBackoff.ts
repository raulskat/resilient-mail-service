export async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 100): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await new Promise(res => setTimeout(res, delay * 2 ** attempt));
      attempt++;
    }
  }
  throw new Error('Failed after retries');
}
