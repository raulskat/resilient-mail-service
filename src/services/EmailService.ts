import { ProviderA } from '../providers/ProviderA';
import { ProviderB } from '../providers/ProviderB';
import { retryWithBackoff } from '../utils/retryWithBackoff';
import { InMemoryStore } from '../store/InMemoryStore';
import { CircuitBreaker } from '../utils/circuitBreaker';
import { logger } from '../utils/logger';
import { MessageQueue, MessagePriority, EmailMessage, MessageProcessor } from '../queue/MessageQueue';
import { Server as SocketIOServer } from 'socket.io';

// Email sending result type
export type EmailResult = 'Sent' | 'Queued' | 'Duplicate' | 'Rate limited' | 'Failed';

export class EmailService {
  private store = new InMemoryStore();
  private providers = [new ProviderA(), new ProviderB()];
  private breakers = [new CircuitBreaker(), new CircuitBreaker()];
  private queue: MessageQueue;
  private io?: SocketIOServer;

  constructor(io?: SocketIOServer) {
    this.io = io;
    
    // Initialize queue with message processor function
    this.queue = new MessageQueue(this.processQueuedEmail.bind(this));
    
    // Set up queue event handlers
    this.queue.on('processed', (message: EmailMessage) => {
      logger.info(`Email ${message.id} successfully processed from queue`);
      // Emit status update via WebSocket if available
      const status = this.store.getStatus(message.id);
      if (this.io && status) {
        this.io.to(message.id).emit('status_update', { id: message.id, status });
      }
    });
    
    this.queue.on('failed', (message: EmailMessage) => {
      logger.error(`Email ${message.id} failed after all retries in queue`);
      this.store.markSent(message.id, 'Failed in queue');
      // Emit status update via WebSocket if available
      if (this.io) {
        this.io.to(message.id).emit('status_update', { id: message.id, status: 'Failed in queue' });
      }
    });
  }

  /**
   * Send an email by adding it to the processing queue
   * @returns Promise resolving to the send result
   */
  async sendEmail(id: string, to: string, subject: string, body: string, priority: MessagePriority = MessagePriority.NORMAL): Promise<EmailResult> {
    // Check duplicates and rate limits before queueing
    if (this.store.isDuplicate(id)) return 'Duplicate';
    if (this.store.isRateLimited(to)) return 'Rate limited';

    // Mark as pending in store
    this.store.markSent(id, 'Queued');
    
    // Emit initial status via WebSocket if available
    if (this.io) {
      this.io.to(id).emit('status_update', { id, status: 'Queued' });
    }
    
    // Add to queue
    this.queue.enqueue({
      id,
      to,
      subject,
      body,
      priority
    });
    
    logger.info(`Email ${id} queued for sending`);
    return 'Queued';
  }

  /**
   * Process a queued email message
   * @param message The email message to process
   * @returns Promise resolving to true if sent successfully, false otherwise
   */
  private async processQueuedEmail(message: EmailMessage): Promise<boolean> {
    const { id, to, subject, body } = message;
    
    // Update status to processing
    this.store.markSent(id, 'Processing');
    
    // Try each provider
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      const breaker = this.breakers[i];
      
      if (breaker.isOpen()) {
        logger.warn(`${provider.constructor.name} is on cooldown. Skipping.`);
        continue;
      }

      try {
        await retryWithBackoff(() => provider.send(to, subject, body));
        breaker.recordSuccess();
        
        const status = `Sent via ${provider.constructor.name}`;
        this.store.markSent(id, status);
        
        // Emit status update via WebSocket if available
        if (this.io) {
          this.io.to(id).emit('status_update', { id, status });
        }
        
        logger.info(`Email ${id} sent using ${provider.constructor.name}`);
        return true;
      } catch (e) {
        breaker.recordFailure();
        logger.error(`${provider.constructor.name} failed for email ${id}: ${(e as Error).message}`);
        continue;
      }
    }

    // All providers failed
    const status = 'All providers failed';
    this.store.markSent(id, status);
    
    // Emit status update via WebSocket if available
    if (this.io) {
      this.io.to(id).emit('status_update', { id, status });
    }
    
    logger.error(`Email ${id} failed - all providers exhausted`);
    return false;
  }

  /**
   * Get the status of an email
   */
  getStatus(id: string): string | undefined {
    return this.store.getStatus(id);
  }
  
  /**
   * Manually emit the current status of an email via WebSocket
   */
  emitCurrentStatus(id: string): void {
    if (this.io) {
      const status = this.store.getStatus(id);
      if (status) {
        this.io.to(id).emit('status_update', { id, status });
      }
    }
  }
  
  /**
   * Get the current queue statistics
   */
  getQueueStats(): { length: number; active: number } {
    return {
      length: this.queue.length,
      active: this.queue.active
    };
  }
  
  /**
   * Gracefully shut down the email service
   */
  shutdown(): void {
    this.queue.stop();
    logger.info('Email service shut down');
  }
}
