import { retryWithBackoff } from '../retryWithBackoff';

describe('retryWithBackoff', () => {
  // Setup and teardown for timer mocks
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('should return result immediately if function succeeds on first attempt', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    
    const resultPromise = retryWithBackoff(mockFn, 3, 100);
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(result).toBe('success');
  });

  test('should retry until success and return the successful result', async () => {
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('Attempt 1 failed'))
      .mockRejectedValueOnce(new Error('Attempt 2 failed'))
      .mockResolvedValue('success on attempt 3');
    
    const resultPromise = retryWithBackoff(mockFn, 3, 100);
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    
    expect(mockFn).toHaveBeenCalledTimes(3);
    expect(result).toBe('success on attempt 3');
  });

  test('should throw error if all retries are exhausted', async () => {
    // Create a fixed error message string instead of an Error object
    const errorMessage = 'Simulated failure for testing';
    
    // Mock function that always rejects with the same error message
    const mockFn = jest.fn().mockImplementation(() => {
      return Promise.reject(new Error(errorMessage));
    });
    
    // Start the retry process and capture the promise
    const resultPromise = retryWithBackoff(mockFn, 3, 100);
    
    // First attempt happens immediately (no timer needed)
    expect(mockFn).toHaveBeenCalledTimes(1);
    
    // Run first retry after delay (100ms)
    jest.advanceTimersByTime(100);
    await Promise.resolve(); // Allow any promises to resolve
    await Promise.resolve(); // Ensure all promise chains are flushed
    expect(mockFn).toHaveBeenCalledTimes(2);
    
    // Run second retry after exponential delay (200ms)
    jest.advanceTimersByTime(200);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockFn).toHaveBeenCalledTimes(3);
    
    // Run all remaining timers to ensure everything is complete
    jest.runAllTimers();
    await Promise.resolve();
    
    // Verify the function was called exactly 3 times (original + 2 retries)
    expect(mockFn).toHaveBeenCalledTimes(3);
    
    // Verify the promise rejects with our expected error message
    try {
      await resultPromise;
      // If we reach here, the promise didn't reject as expected
      fail('Promise should have rejected but did not');
    } catch (err) {
      // Type guard for Error
      if (err instanceof Error) {
        expect(err.message).toBe(errorMessage);
      } else {
        fail('Expected error to be instance of Error but got: ' + String(err));
      }
    }
  });

  test('should use exponential backoff for delays between retries', async () => {
    // Use a clearer sequence of mock rejections and resolution
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockRejectedValueOnce(new Error('Second attempt failed'))
      .mockResolvedValueOnce('success on attempt 3');
    
    // Start the retry process
    const resultPromise = retryWithBackoff(mockFn, 3, 100);
    
    // First call happens immediately
    expect(mockFn).toHaveBeenCalledTimes(1);
    
    // Use advanceTimersByTimeAsync for more reliable timer advancement
    // First retry happens after 100ms delay
    await jest.advanceTimersByTimeAsync(100);
    expect(mockFn).toHaveBeenCalledTimes(2);
    
    // Second retry happens after 200ms delay (exponential backoff)
    await jest.advanceTimersByTimeAsync(200);
    expect(mockFn).toHaveBeenCalledTimes(3);
    
    // No more retries should happen after success
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockFn).toHaveBeenCalledTimes(3);
    
    // Check final result
    const result = await resultPromise;
    expect(result).toBe('success on attempt 3');
  });

  test('should work with custom retry counts and delays', async () => {
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('Attempt 1 failed'))
      .mockRejectedValueOnce(new Error('Attempt 2 failed'))
      .mockRejectedValueOnce(new Error('Attempt 3 failed'))
      .mockRejectedValueOnce(new Error('Attempt 4 failed'))
      .mockResolvedValue('success on attempt 5');
    
    const resultPromise = retryWithBackoff(mockFn, 5, 50);
    await jest.runAllTimersAsync();
    const result = await resultPromise;
    
    expect(mockFn).toHaveBeenCalledTimes(5);
    expect(result).toBe('success on attempt 5');
  });
});

