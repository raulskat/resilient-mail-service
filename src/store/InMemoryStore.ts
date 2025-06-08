export class InMemoryStore {
  private sent = new Map<string, boolean>();
  private status = new Map<string, string>();
  private rateLimit = new Map<string, number>();

  constructor(private rateLimitPerMinute = 5) {}

  isRateLimited(to: string): boolean {
    const now = Date.now();
    const lastSent = this.rateLimit.get(to);
    
    // If this is the first email for this recipient, it's not rate limited
    if (lastSent === undefined) {
      this.rateLimit.set(to, now);
      return false;
    }
    
    // Calculate the minimum time interval between emails
    const minInterval = 60000 / this.rateLimitPerMinute;
    
    // Check if enough time has passed since the last email
    if (now - lastSent < minInterval) {
      return true;
    }
    
    // Update the last sent timestamp
    this.rateLimit.set(to, now);
    return false;
  }
  
  // For testing - mark an email as sent without checking rate limits
  markEmailSent(to: string): void {
    this.rateLimit.set(to, Date.now());
  }

  isDuplicate(id: string): boolean {
    return this.sent.has(id);
  }

  markSent(id: string, status: string): void {
    this.sent.set(id, true);
    this.status.set(id, status);
  }

  getStatus(id: string): string | undefined {
    return this.status.get(id);
  }
}