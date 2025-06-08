import { EmailService, EmailResult } from '../EmailService';
import { ProviderA } from '../../providers/ProviderA';
import { ProviderB } from '../../providers/ProviderB';
import { InMemoryStore } from '../../store/InMemoryStore';
import { CircuitBreaker } from '../../utils/circuitBreaker';
import { MessageQueue, MessagePriority, EmailMessage } from '../../queue/MessageQueue';

// Mock dependencies
jest.mock('../../providers/ProviderA');
jest.mock('../../providers/ProviderB');
jest.mock('../../store/InMemoryStore');
jest.mock('../../utils/circuitBreaker');
jest.mock('../../utils/retryWithBackoff', () => ({
  retryWithBackoff: jest.fn(async (fn) => fn())
}));
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));
jest.mock('../../queue/MessageQueue');

describe('EmailService', () => {
  let emailService: EmailService;
  let mockProviderA: jest.Mocked<ProviderA>;
  let mockProviderB: jest.Mocked<ProviderB>;
  let mockStore: jest.Mocked<InMemoryStore>;
  let mockBreakerA: jest.Mocked<CircuitBreaker>;
  let mockBreakerB: jest.Mocked<CircuitBreaker>;
  let mockQueue: jest.Mocked<MessageQueue>;
  
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup mock implementations
    mockProviderA = new ProviderA() as jest.Mocked<ProviderA>;
    mockProviderB = new ProviderB() as jest.Mocked<ProviderB>;
    mockStore = new InMemoryStore() as jest.Mocked<InMemoryStore>;
    mockBreakerA = new CircuitBreaker() as jest.Mocked<CircuitBreaker>;
    mockBreakerB = new CircuitBreaker() as jest.Mocked<CircuitBreaker>;
    mockQueue = new MessageQueue(jest.fn()) as jest.Mocked<MessageQueue>;
    
    // Default implementations
    mockStore.isDuplicate.mockReturnValue(false);
    mockStore.isRateLimited.mockReturnValue(false);
    mockBreakerA.isOpen.mockReturnValue(false);
    mockBreakerB.isOpen.mockReturnValue(false);
    mockQueue.enqueue.mockReturnValue(1);
    
    // Create service with mocked dependencies
    emailService = new EmailService();
    
    // Replace private properties with mocks
    Object.defineProperty(emailService, 'store', { value: mockStore });
    Object.defineProperty(emailService, 'providers', { value: [mockProviderA, mockProviderB] });
    Object.defineProperty(emailService, 'breakers', { value: [mockBreakerA, mockBreakerB] });
    Object.defineProperty(emailService, 'queue', { value: mockQueue });
  });
  
  describe('Email queueing', () => {
    test('should queue email and return "Queued" status', async () => {
      const result = await emailService.sendEmail('123', 'to@example.com', 'Subject', 'Body');
      
      expect(result).toBe('Queued');
      expect(mockQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
        id: '123',
        to: 'to@example.com',
        subject: 'Subject',
        body: 'Body',
        priority: MessagePriority.NORMAL
      }));
      expect(mockStore.markSent).toHaveBeenCalledWith('123', 'Queued');
    });
    
    test('should respect priority when queueing emails', async () => {
      await emailService.sendEmail('123', 'to@example.com', 'Subject', 'Body', MessagePriority.HIGH);
      
      expect(mockQueue.enqueue).toHaveBeenCalledWith(expect.objectContaining({
        id: '123',
        priority: MessagePriority.HIGH
      }));
    });
    
    test('should not queue duplicate emails', async () => {
      mockStore.isDuplicate.mockReturnValue(true);
      
      const result = await emailService.sendEmail('123', 'to@example.com', 'Subject', 'Body');
      
      expect(result).toBe('Duplicate');
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });
    
    test('should not queue rate-limited emails', async () => {
      mockStore.isRateLimited.mockReturnValue(true);
      
      const result = await emailService.sendEmail('123', 'to@example.com', 'Subject', 'Body');
      
      expect(result).toBe('Rate limited');
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });
  });
  
  describe('Queue processing', () => {
    // These tests verify the message processor function by accessing it directly
    test('should process queued emails with provider successfully', async () => {
      // Access the processQueuedEmail method directly
      const processQueuedEmail = (emailService as any).processQueuedEmail.bind(emailService);
      
      // Setup provider success
      mockProviderA.send.mockResolvedValue(true);
      
      // Create a test message
      const message: EmailMessage = {
        id: '123',
        to: 'to@example.com',
        subject: 'Subject',
        body: 'Body',
        priority: MessagePriority.NORMAL,
        retryCount: 0,
        createdAt: new Date()
      };
      
      // Call the processor directly
      const result = await processQueuedEmail(message);
      
      expect(result).toBe(true);
      expect(mockProviderA.send).toHaveBeenCalledWith('to@example.com', 'Subject', 'Body');
      expect(mockBreakerA.recordSuccess).toHaveBeenCalled();
      expect(mockStore.markSent).toHaveBeenCalledWith('123', expect.stringContaining('ProviderA'));
    });
    
    test('should try second provider when first provider fails', async () => {
      // Access the processQueuedEmail method directly
      const processQueuedEmail = (emailService as any).processQueuedEmail.bind(emailService);
      
      mockProviderA.send.mockRejectedValue(new Error('ProviderA failed'));
      mockProviderB.send.mockResolvedValue(true);
      
      const message: EmailMessage = {
        id: '123',
        to: 'to@example.com',
        subject: 'Subject',
        body: 'Body',
        priority: MessagePriority.NORMAL,
        retryCount: 0,
        createdAt: new Date()
      };
      
      const result = await processQueuedEmail(message);
      
      expect(result).toBe(true);
      expect(mockProviderA.send).toHaveBeenCalled();
      expect(mockProviderB.send).toHaveBeenCalled();
      expect(mockBreakerA.recordFailure).toHaveBeenCalled();
      expect(mockBreakerB.recordSuccess).toHaveBeenCalled();
      expect(mockStore.markSent).toHaveBeenCalledWith('123', expect.stringContaining('ProviderB'));
    });
    
    test('should return false when all providers fail', async () => {
      // Access the processQueuedEmail method directly
      const processQueuedEmail = (emailService as any).processQueuedEmail.bind(emailService);
      
      mockProviderA.send.mockRejectedValue(new Error('ProviderA failed'));
      mockProviderB.send.mockRejectedValue(new Error('ProviderB failed'));
      
      const message: EmailMessage = {
        id: '123',
        to: 'to@example.com',
        subject: 'Subject',
        body: 'Body',
        priority: MessagePriority.NORMAL,
        retryCount: 0,
        createdAt: new Date()
      };
      
      const result = await processQueuedEmail(message);
      
      expect(result).toBe(false);
      expect(mockProviderA.send).toHaveBeenCalled();
      expect(mockProviderB.send).toHaveBeenCalled();
      expect(mockBreakerA.recordFailure).toHaveBeenCalled();
      expect(mockBreakerB.recordFailure).toHaveBeenCalled();
      expect(mockStore.markSent).toHaveBeenCalledWith('123', 'All providers failed');
    });
    
    test('should skip provider when circuit breaker is open', async () => {
      // Access the processQueuedEmail method directly
      const processQueuedEmail = (emailService as any).processQueuedEmail.bind(emailService);
      
      mockBreakerA.isOpen.mockReturnValue(true);
      mockProviderB.send.mockResolvedValue(true);
      
      const message: EmailMessage = {
        id: '123',
        to: 'to@example.com',
        subject: 'Subject',
        body: 'Body',
        priority: MessagePriority.NORMAL,
        retryCount: 0,
        createdAt: new Date()
      };
      
      const result = await processQueuedEmail(message);
      
      expect(result).toBe(true);
      expect(mockProviderA.send).not.toHaveBeenCalled();
      expect(mockProviderB.send).toHaveBeenCalled();
    });
  });
  
  describe('Status tracking', () => {
    test('should retrieve email status correctly', () => {
      mockStore.getStatus.mockReturnValue('Sent via ProviderA');
      
      const status = emailService.getStatus('123');
      
      expect(status).toBe('Sent via ProviderA');
      expect(mockStore.getStatus).toHaveBeenCalledWith('123');
    });
  });
  
  describe('Queue management', () => {
    test('should report queue statistics correctly', () => {
      Object.defineProperty(mockQueue, 'length', { get: () => 5 });
      Object.defineProperty(mockQueue, 'active', { get: () => 2 });
      
      const stats = emailService.getQueueStats();
      
      expect(stats).toEqual({ length: 5, active: 2 });
    });
    
    test('should stop queue processing on shutdown', () => {
      emailService.shutdown();
      
      expect(mockQueue.stop).toHaveBeenCalled();
    });
  });
  
  describe('Queue events', () => {
    test('should setup event handlers for queue events', () => {
      // Check that event handlers were registered
      expect(mockQueue.on).toHaveBeenCalledWith('processed', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('failed', expect.any(Function));
    });
    
    test('should update status when queue processing fails', () => {
      // Get the 'failed' event handler
      const failedHandler = (mockQueue.on as jest.Mock).mock.calls.find(
        call => call[0] === 'failed'
      )?.[1];
      
      // Call the handler directly
      failedHandler({ id: '123', retryCount: 3 });
      
      // Check status was updated
      expect(mockStore.markSent).toHaveBeenCalledWith('123', 'Failed in queue');
    });
  });
});

