# Resilient Email Service

A robust, fault-tolerant email sending service built with TypeScript that implements multiple resilience patterns to ensure reliable email delivery.

## Project Overview

This service provides a resilient email sending capability with the following key features:
- Multiple provider support with automatic fallback
- Retry mechanism with exponential backoff
- Circuit breaker pattern to prevent cascading failures
- Rate limiting to prevent abuse
- Idempotency to prevent duplicate sends
- Status tracking for all email sending attempts

The implementation uses mock email providers to simulate real-world email sending, with controlled failure scenarios for testing resilience.

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Setup
1. Clone the repository:
```bash
git clone https://github.com/raulskat/resilient-mail-service
cd resilient-mail-service
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```
# Cloud Deployment Summary

The Resilient Email Service has been successfully deployed on a cloud server and is accessible at:
``` bash
http://16.171.135.54/
```

The service runs continuously using PM2 to ensure fault tolerance and automatic restarts. It listens on port XYZ and is configured with key resilience features such as retry with exponential backoff, circuit breaker, rate limiting, and idempotency to guarantee reliable email delivery even under failure conditions.

The server's firewall and security settings are configured to allow traffic on port XYZ, enabling seamless API access for sending emails and checking status. This deployment ensures the service is production-ready with high availability and robustness.


## Usage

### Basic Usage

Start the server:
```bash
npm run dev
```

Send an email using the API:
```bash
curl -X POST http://localhost:3000/send-email \
  -H "Content-Type: application/json" \
  -d '{"id":"123", "to":"user@example.com", "subject":"Hello", "body":"This is a test"}'
```

Check email status:
```bash
curl http://localhost:3000/status/123
```

### Fail over 2nd provider
```bash
curl -X POST http://localhost:3000/send-email \
  -H "Content-Type: application/json" \
  -d '{"id":"failover-001", "to":"test@example.com", "subject":"Failover Test", "body":"Trying to trigger ProviderB"}'


curl http://localhost:3000/status/failover-001
```

### Code Example

```typescript
import { EmailService } from './services/EmailService';

const emailService = new EmailService();

async function sendEmail() {
  try {
    const result = await emailService.sendEmail(
      'unique-id-123',
      'recipient@example.com',
      'Hello from the Resilient Email Service',
      'This is a test email sent through our resilient service.'
    );
    
    console.log(`Email sending result: ${result}`);
    
    // Check status later
    const status = emailService.getStatus('unique-id-123');
    console.log(`Current status: ${status}`);
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

sendEmail();
```

## Architecture

The service is built with a modular architecture focusing on separation of concerns:

### Components

1. **EmailService**: Core service that orchestrates the email sending process
2. **Providers (ProviderA, ProviderB)**: Mock email service providers
3. **InMemoryStore**: Storage for tracking sent emails, rate limiting, and status
4. **CircuitBreaker**: Prevents cascading failures by detecting unhealthy providers
5. **RetryWithBackoff**: Handles transient failures with exponential delay

### Flow Diagram
```
┌─────────────┐     ┌─────────────┐     ┌───────────────┐
│  API Layer  │────▶│ EmailService │────▶│ Circuit Check │
└─────────────┘     └─────────────┘     └───────────────┘
                           │                     │
                           ▼                     ▼
                    ┌─────────────┐     ┌───────────────┐
                    │ Rate Limit & │    ┌┤   Provider A  │
                    │ Idempotency  │    │└───────────────┘
                    └─────────────┘    │
                           │           │┌───────────────┐
                           ▼           └┤   Provider B  │
                    ┌─────────────┐     └───────────────┘
                    │Status Update│
                    └─────────────┘
```

## Features

### Retry Mechanism

The service implements an exponential backoff strategy:
- Initial retry after a short delay
- Each subsequent retry increases the delay exponentially
- Configurable max retry count
- Proper error propagation

```typescript
// Example: retryWithBackoff.ts
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
```

### Circuit Breaker

The circuit breaker prevents cascading failures by temporarily disabling providers that are failing:
- Tracks failure counts
- Automatically opens (disables) after threshold failures
- Implements cooldown period
- Auto-resets after cooldown
- Success threshold for stability

### Rate Limiting

Rate limiting prevents abuse of the service:
- Configurable rate limits (emails per minute)
- Per-recipient tracking
- Time-based sliding window approach

### Idempotency

Prevents duplicate email sends:
- Tracks email IDs that have been processed
- Returns early for duplicate requests
- Maintains status for each unique ID

## Testing

### Running Tests

Run the full test suite:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

### Test Structure

Tests are organized by component:
- `src/providers/__tests__/`: Provider tests
- `src/utils/__tests__/`: Utility function tests (retry, circuit breaker)
- `src/store/__tests__/`: Storage tests
- `src/services/__tests__/`: Service integration tests

## Design Decisions & Assumptions

### Design Principles
- **Separation of Concerns**: Each component has a single responsibility
- **Fault Tolerance**: The system continues to function despite failures
- **Progressive Degradation**: Service falls back to alternative providers
- **Observability**: Comprehensive logging and status tracking

### Assumptions
1. Email providers are unreliable and may fail
2. Duplicate emails with the same ID should be prevented
3. Rate limiting should be applied per recipient
4. In-memory storage is sufficient for demo purposes
5. Circuit breaker thresholds and cooldown periods are configurable
6. Retry attempts should use exponential backoff to prevent overwhelming providers

## Future Enhancements
- Persistent storage for production use
- Advanced queue system with prioritization
- Provider health checks
- Metrics collection and monitoring
- Dynamic configuration of thresholds and limits
- Admin dashboard for monitoring
