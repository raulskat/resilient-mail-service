export class CircuitBreaker {
  private failureCount = 0;
  private successThreshold = 1;
  private failureThreshold = 3;
  private cooldownPeriod = 10000;
  private lastFailureTime = 0;

  isOpen(): boolean {
    if (this.failureCount >= this.failureThreshold) {
      const now = Date.now();
      return now - this.lastFailureTime < this.cooldownPeriod;
    }
    return false;
  }

  recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
  }

  recordSuccess() {
    this.failureCount = 0;
  }
}
