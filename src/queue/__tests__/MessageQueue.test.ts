import { MessageQueue, MessagePriority, EmailMessage } from '../MessageQueue';

// Mock the logger to avoid console output in tests
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('MessageQueue', () => {
  let queue: MessageQueue;
  let mockProcessor: jest.Mock;
  
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] });
    mockProcessor = jest.fn().mockResolvedValue(true);
    queue = new MessageQueue(mockProcessor, {
      processingInterval: 50,
      maxRetries: 2,
      retryDelay: 100,
      batchSize: 3,
      maxConcurrent: 2
    });
  });
  
  afterEach(() => {
    queue.stop();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });
  
  describe('Basic enqueueing and processing', () => {
    test('should enqueue a message and process it', async () => {
      // Set up event handler spies
      const enqueuedSpy = jest.fn();
      const processedSpy = jest.fn();
      queue.on('enqueued', enqueuedSpy);
      queue.on('processed', processedSpy);
      
      // Mock implementation to resolve after we can check its args
      let messageProcessed: EmailMessage | null = null;
      mockProcessor.mockImplementation(async (message: EmailMessage) => {
        messageProcessed = message;
        return true;
      });
      
      // Enqueue a message
      const message = {
        id: 'test-1',
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test Body',
        priority: MessagePriority.NORMAL
      };
      
      queue.enqueue(message);
      
      // Check enqueued event was emitted
      expect(enqueuedSpy).toHaveBeenCalled();
      
      // Advance timer to start processing
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      
      // Verify the processor was called
      expect(mockProcessor).toHaveBeenCalled();
      expect(messageProcessed).toEqual(expect.objectContaining({
        id: 'test-1',
        to: 'test@example.com'
      }));
      
      // Check processed event was emitted after processor resolves
      expect(processedSpy).toHaveBeenCalled();
    });
    
    test('should return queue length after enqueueing', () => {
      const length = queue.enqueue({
        id: 'test-1',
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test',
        priority: MessagePriority.NORMAL
      });
      
      expect(length).toBe(1);
      
      const length2 = queue.enqueue({
        id: 'test-2',
        to: 'test@example.com',
        subject: 'Test',
        body: 'Test',
        priority: MessagePriority.NORMAL
      });
      
      expect(length2).toBe(2);
    });
  });
  
  describe('Priority handling', () => {
    test('should process high priority messages before normal ones', async () => {
      const processedIds: string[] = [];
      mockProcessor.mockImplementation(async (message: EmailMessage) => {
        processedIds.push(message.id);
        return true;
      });
      
      // Enqueue normal priority message first
      queue.enqueue({
        id: 'normal-1',
        to: 'test@example.com',
        subject: 'Normal',
        body: 'Test',
        priority: MessagePriority.NORMAL
      });
      
      // Then enqueue high priority message
      queue.enqueue({
        id: 'high-1',
        to: 'test@example.com',
        subject: 'High',
        body: 'Test',
        priority: MessagePriority.HIGH
      });
      
      // Advance timer to start processing (first batch)
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve(); // Ensure all microtasks are processed
      
      // Advance timer again to process the second message
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
      
      // High priority message should be processed first
      expect(processedIds.length).toBe(2);
      expect(processedIds[0]).toBe('high-1');
      expect(processedIds[1]).toBe('normal-1');
    });
    
    test('should handle multiple priority levels correctly', async () => {
      const processedIds: string[] = [];
      mockProcessor.mockImplementation(async (message: EmailMessage) => {
        processedIds.push(message.id);
        return true;
      });
      
      // Enqueue messages in different order than their priority
      queue.enqueue({
        id: 'normal-1',
        to: 'test@example.com',
        subject: 'Normal',
        body: 'Test',
        priority: MessagePriority.NORMAL
      });
      
      queue.enqueue({
        id: 'low-1',
        to: 'test@example.com',
        subject: 'Low',
        body: 'Test',
        priority: MessagePriority.LOW
      });
      
      queue.enqueue({
        id: 'high-1',
        to: 'test@example.com',
        subject: 'High',
        body: 'Test',
        priority: MessagePriority.HIGH
      });
      
      // Process messages one by one to ensure deterministic ordering
      // First message (should be high priority)
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
      
      // Second message
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
      
      // Third message
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
      
      // Messages should be processed in priority order
      expect(processedIds.length).toBe(3);
      expect(processedIds[0]).toBe('high-1');
      expect(processedIds[1]).toBe('normal-1');
      expect(processedIds[2]).toBe('low-1');
    });
  });
  
  describe('Batch processing', () => {
    test('should process messages in batches respecting maxConcurrent', async () => {
      let activeCount = 0;
      let maxActiveCount = 0;
      let processedCount = 0;
      
      // Create a processor that tracks concurrency and resolves immediately
      mockProcessor.mockImplementation(async () => {
        activeCount++;
        processedCount++;
        if (activeCount > maxActiveCount) {
          maxActiveCount = activeCount;
        }
        // Decreasing activeCount synchronously for this test
        activeCount--;
        return true;
      });
      
      // Enqueue 5 messages
      for (let i = 0; i < 5; i++) {
        queue.enqueue({
          id: `batch-${i}`,
          to: 'test@example.com',
          subject: 'Batch Test',
          body: 'Test',
          priority: MessagePriority.NORMAL
        });
      }
      
      // Process first batch
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      
      // Process second batch
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      
      // Process third batch if needed
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      
      // Max concurrent should respect the config (2)
      expect(maxActiveCount).toBe(2);
      
      // All messages should be processed
      expect(processedCount).toBe(5);
    });
  });
  
  describe('Retry logic', () => {
    test('should retry failed messages with exponential backoff', async () => {
      // Setup to track retry attempts
      const processAttempts: Record<string, number> = { 'retry-1': 0 };
      const requeuedSpy = jest.fn();
      queue.on('requeued', requeuedSpy);
      
      // First two attempts fail, third succeeds
      mockProcessor.mockImplementation(async (message: EmailMessage) => {
        processAttempts[message.id]++;
        if (processAttempts[message.id] < 3) {
          return false; // Fail first two attempts
        }
        return true; // Succeed on third attempt
      });
      
      // Enqueue message
      queue.enqueue({
        id: 'retry-1',
        to: 'test@example.com',
        subject: 'Retry Test',
        body: 'Test',
        priority: MessagePriority.NORMAL
      });
      
      // Run initial processing
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      // First attempt should have happened
      expect(processAttempts['retry-1']).toBe(1);
      
      // First retry should be scheduled after retryDelay (100ms)
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      // Should be requeued after failure
      expect(requeuedSpy).toHaveBeenCalledTimes(1);
      
      // Process the requeued message
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      // Second attempt should have happened
      expect(processAttempts['retry-1']).toBe(2);
      
      // Second retry should be scheduled after retryDelay * 2^1 (200ms)
      jest.advanceTimersByTime(200);
      await Promise.resolve();
      
      // Should be requeued again
      expect(requeuedSpy).toHaveBeenCalledTimes(2);
      
      // Process the requeued message again
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      
      // Third attempt should succeed
      expect(processAttempts['retry-1']).toBe(3);
      
      // No more requeues should happen
      expect(requeuedSpy).toHaveBeenCalledTimes(2);
    });
    
    test('should emit failed event after max retries', async () => {
      // Set up event handler spy
      const failedSpy = jest.fn();
      queue.on('failed', failedSpy);
      
      // Always fail
      mockProcessor.mockResolvedValue(false);
      
      // Enqueue message
      queue.enqueue({
        id: 'fail-1',
        to: 'test@example.com',
        subject: 'Fail Test',
        body: 'Test',
        priority: MessagePriority.NORMAL
      });
      
      // Initial processing
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      
      // First retry (after 100ms delay)
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      jest.advanceTimersByTime(50); // processing interval
      await Promise.resolve();
      
      // Second retry (after 200ms delay)
      jest.advanceTimersByTime(200);
      await Promise.resolve();
      jest.advanceTimersByTime(50); // processing interval
      await Promise.resolve();
      
      // Should have tried maxRetries + 1 times (original + 2 retries)
      expect(mockProcessor).toHaveBeenCalledTimes(3);
      
      // Should emit failed event
      expect(failedSpy).toHaveBeenCalledWith(expect.objectContaining({
        id: 'fail-1',
        retryCount: 3
      }));
    });
  });
  
  describe('Queue management', () => {
    test('should stop processing when stop is called', async () => {
      // Enqueue a message
      queue.enqueue({
        id: 'stop-test',
        to: 'test@example.com',
        subject: 'Stop Test',
        body: 'Test',
        priority: MessagePriority.NORMAL
      });
      
      // Stop the queue before processing
      queue.stop();
      
      // Advance timers
      await jest.runAllTimersAsync();
      
      // Processor should not be called
      expect(mockProcessor).not.toHaveBeenCalled();
    });
    
    test('should report queue statistics correctly', async () => {
      expect(queue.length).toBe(0);
      expect(queue.active).toBe(0);
      
      // Mock implementation to control when processor resolves
      let resolveProcessor: Array<(value: boolean) => void> = [];
      mockProcessor.mockImplementation(() => {
        return new Promise<boolean>(resolve => {
          resolveProcessor.push(resolve);
        });
      });
      
      // Add messages to queue (these won't be processed yet since processor doesn't resolve)
      queue.enqueue({
        id: 'stats-1',
        to: 'test@example.com',
        subject: 'Stats Test',
        body: 'Test',
        priority: MessagePriority.NORMAL
      });
      
      queue.enqueue({
        id: 'stats-2',
        to: 'test@example.com',
        subject: 'Stats Test',
        body: 'Test',
        priority: MessagePriority.NORMAL
      });
      
      // Queue length should be 2 before processing starts
      expect(queue.length).toBe(2);
      
      // Start processing (this will take 2 messages out of the queue)
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      
      // Active count should be 2 (maxConcurrent)
      expect(queue.active).toBe(2);
      
      // Queue should be empty now (both messages are being processed)
      expect(queue.length).toBe(0);
      
      // Resolve the processors one by one
      resolveProcessor[0](true);
      await Promise.resolve();
      
      resolveProcessor[1](true);
      await Promise.resolve();
      
      // Queue should still be empty
      expect(queue.length).toBe(0);
      
      // Active count should be back to 0
      expect(queue.active).toBe(0);
    });
  });
});

