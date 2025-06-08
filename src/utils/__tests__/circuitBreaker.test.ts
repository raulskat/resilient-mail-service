import { CircuitBreaker } from '../circuitBreaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let originalDateNow: () => number;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker();
    originalDateNow = Date.now;
    // Mock Date.now to have a consistent starting time
    Date.now = jest.fn().mockReturnValue(1000);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  test('should start in closed state', () => {
    expect(circuitBreaker.isOpen()).toBe(false);
  });

  test('should remain closed after fewer than threshold failures', () => {
    // Default threshold is 3, so record 2 failures
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    
    expect(circuitBreaker.isOpen()).toBe(false);
  });

  test('should transition to open state after threshold failures', () => {
    // Record 3 failures (default threshold)
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    
    expect(circuitBreaker.isOpen()).toBe(true);
  });

  test('should reset failure count after a success', () => {
    // Record 2 failures
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    
    // Record a success
    circuitBreaker.recordSuccess();
    
    // Record 2 more failures - shouldn't open yet because counter was reset
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    
    expect(circuitBreaker.isOpen()).toBe(false);
  });

  test('should remain open during cooldown period', () => {
    // Trigger the circuit breaker to open
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    
    // Advance time but not enough for cooldown (default 10000ms)
    (Date.now as jest.Mock).mockReturnValue(5000);
    
    expect(circuitBreaker.isOpen()).toBe(true);
  });

  test('should close after cooldown period expires', () => {
    // Trigger the circuit breaker to open
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    
    // Advance time past cooldown period (default 10000ms)
    (Date.now as jest.Mock).mockReturnValue(12000);
    
    expect(circuitBreaker.isOpen()).toBe(false);
  });

  test('should count additional failures while in open state', () => {
    // Trigger the circuit breaker to open
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    
    // Record another failure
    circuitBreaker.recordFailure();
    
    // Advance time past cooldown
    (Date.now as jest.Mock).mockReturnValue(12000);
    
    // Should be closed now, but next failure should immediately open it again
    expect(circuitBreaker.isOpen()).toBe(false);
    
    // One more failure should trigger it to open again because we're still at 4 failures
    circuitBreaker.recordFailure();
    expect(circuitBreaker.isOpen()).toBe(true);
  });
});

