import { InMemoryStore } from '../InMemoryStore';

describe('InMemoryStore', () => {
  let store: InMemoryStore;
  let originalDateNow: () => number;
  
  beforeEach(() => {
    store = new InMemoryStore(5); // 5 emails per minute rate limit
    originalDateNow = Date.now;
    // Mock Date.now for consistent testing - starting at 1000ms
    Date.now = jest.fn().mockReturnValue(1000);
  });
  
  afterEach(() => {
    Date.now = originalDateNow;
  });
  
  describe('Rate limiting', () => {
    test('should not rate limit on first email', () => {
      expect(store.isRateLimited('user@example.com')).toBe(false);
    });
    
    test('should rate limit when sending too frequently', () => {
      // First email is not rate limited
      expect(store.isRateLimited('user@example.com')).toBe(false);
      
      // Reset mock to ensure exact same time for the second call
      jest.clearAllMocks();
      (Date.now as jest.Mock).mockReturnValue(1000);
      
      // Second email sent immediately after is rate limited (rate = 5 per minute = 12000ms per email)
      expect(store.isRateLimited('user@example.com')).toBe(true);
    });
    
    test('should allow emails after rate limit window', () => {
      // First email
      expect(store.isRateLimited('user@example.com')).toBe(false);
      
      // Advance time past the rate limit window (60000ms / 5 = 12000ms per email)
      (Date.now as jest.Mock).mockReturnValue(13000);
      
      // Should allow another email
      expect(store.isRateLimited('user@example.com')).toBe(false);
    });
    
    test('should handle multiple recipients independently', () => {
      // First recipient
      expect(store.isRateLimited('user1@example.com')).toBe(false);
      
      // Reset mock to ensure exact same time for the second call
      jest.clearAllMocks();
      (Date.now as jest.Mock).mockReturnValue(1000);
      
      // Second email to same recipient should be rate limited
      expect(store.isRateLimited('user1@example.com')).toBe(true);
      
      // Different recipient should not be affected
      expect(store.isRateLimited('user2@example.com')).toBe(false);
    });
    
    test('should respect custom rate limit', () => {
      // Create store with higher rate limit (10 per minute = 6000ms per email)
      const highRateStore = new InMemoryStore(10);
      
      // First email
      expect(highRateStore.isRateLimited('user@example.com')).toBe(false);
      
      // Advance time but not enough for default rate (5 per min = 12000ms)
      // but enough for high rate (10 per min = 6000ms)
      (Date.now as jest.Mock).mockReturnValue(7000);
      
      // Should allow another email with higher rate
      expect(highRateStore.isRateLimited('user@example.com')).toBe(false);
    });
    
    test('should calculate rate limit window correctly', () => {
      // First email at t=1000
      expect(store.isRateLimited('test@example.com')).toBe(false);
      
      // Just before window ends (12000ms - 1ms)
      (Date.now as jest.Mock).mockReturnValue(12999);
      expect(store.isRateLimited('test@example.com')).toBe(true);
      
      // Right at window end (12000ms)
      (Date.now as jest.Mock).mockReturnValue(13000);
      expect(store.isRateLimited('test@example.com')).toBe(false);
    });
  });
  
  describe('Idempotency', () => {
    test('should detect duplicate IDs', () => {
      // Mark ID as sent
      store.markSent('email-123', 'Sent');
      
      // Check if it's a duplicate
      expect(store.isDuplicate('email-123')).toBe(true);
    });
    
    test('should not mark different IDs as duplicates', () => {
      store.markSent('email-123', 'Sent');
      
      expect(store.isDuplicate('email-456')).toBe(false);
    });
    
    test('should handle empty ID correctly', () => {
      expect(store.isDuplicate('')).toBe(false);
      
      store.markSent('', 'Sent');
      
      expect(store.isDuplicate('')).toBe(true);
    });
  });
  
  describe('Status tracking', () => {
    test('should store and retrieve status correctly', () => {
      store.markSent('email-123', 'Sent via ProviderA');
      
      expect(store.getStatus('email-123')).toBe('Sent via ProviderA');
    });
    
    test('should return undefined for non-existent ID', () => {
      expect(store.getStatus('non-existent')).toBeUndefined();
    });
    
    test('should update status for existing ID', () => {
      store.markSent('email-123', 'Sent via ProviderA');
      store.markSent('email-123', 'Failed');
      
      expect(store.getStatus('email-123')).toBe('Failed');
    });
    
    test('should handle multiple statuses independently', () => {
      store.markSent('email-123', 'Sent via ProviderA');
      store.markSent('email-456', 'Sent via ProviderB');
      
      expect(store.getStatus('email-123')).toBe('Sent via ProviderA');
      expect(store.getStatus('email-456')).toBe('Sent via ProviderB');
    });
  });
});

