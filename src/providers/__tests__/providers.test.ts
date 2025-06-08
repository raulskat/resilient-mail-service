import { ProviderA } from '../ProviderA';
import { ProviderB } from '../ProviderB';

describe('Email Providers', () => {
  // Mock Math.random to control the success/failure behavior
  let originalRandom: () => number;
  
  beforeEach(() => {
    originalRandom = Math.random;
  });
  
  afterEach(() => {
    Math.random = originalRandom;
  });
  
  describe('ProviderA', () => {
    test('should send email successfully when random value is >= 0.5', async () => {
      // Mock Math.random to return 0.5 (success case)
      Math.random = jest.fn().mockReturnValue(0.5);
      
      const provider = new ProviderA();
      const result = await provider.send('test@example.com', 'Test Subject', 'Test Body');
      
      expect(result).toBe(true);
    });
    
    test('should throw error when random value is < 0.5', async () => {
      // Mock Math.random to return 0.4 (failure case)
      Math.random = jest.fn().mockReturnValue(0.4);
      
      const provider = new ProviderA();
      await expect(
        provider.send('test@example.com', 'Test Subject', 'Test Body')
      ).rejects.toThrow('ProviderA failed');
    });
    
    test('should have approximately 50% failure rate', async () => {
      // Restore the original Math.random for this test
      Math.random = originalRandom;
      
      const provider = new ProviderA();
      const attempts = 100;
      let successes = 0;
      
      for (let i = 0; i < attempts; i++) {
        try {
          await provider.send('test@example.com', 'Test Subject', 'Test Body');
          successes++;
        } catch (error) {
          // Expected to fail sometimes
        }
      }
      
      // With 100 attempts, success rate should be roughly 50% ± 15%
      const successRate = successes / attempts;
      expect(successRate).toBeGreaterThanOrEqual(0.35);
      expect(successRate).toBeLessThanOrEqual(0.65);
    });
  });
  
  describe('ProviderB', () => {
    test('should send email successfully when random value is >= 0.5', async () => {
      // Mock Math.random to return 0.5 (success case)
      Math.random = jest.fn().mockReturnValue(0.5);
      
      const provider = new ProviderB();
      const result = await provider.send('test@example.com', 'Test Subject', 'Test Body');
      
      expect(result).toBe(true);
    });
    
    test('should throw error when random value is < 0.5', async () => {
      // Mock Math.random to return 0.4 (failure case)
      Math.random = jest.fn().mockReturnValue(0.4);
      
      const provider = new ProviderB();
      await expect(
        provider.send('test@example.com', 'Test Subject', 'Test Body')
      ).rejects.toThrow('ProviderB failed');
    });
    
    test('should have approximately 50% failure rate', async () => {
      // Restore the original Math.random for this test
      Math.random = originalRandom;
      
      const provider = new ProviderB();
      const attempts = 100;
      let successes = 0;
      
      for (let i = 0; i < attempts; i++) {
        try {
          await provider.send('test@example.com', 'Test Subject', 'Test Body');
          successes++;
        } catch (error) {
          // Expected to fail sometimes
        }
      }
      
      // With 100 attempts, success rate should be roughly 50% ± 15%
      const successRate = successes / attempts;
      expect(successRate).toBeGreaterThanOrEqual(0.35);
      expect(successRate).toBeLessThanOrEqual(0.65);
    });
  });
});

