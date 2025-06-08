export class ProviderA {
  async send(to: string, subject: string, body: string): Promise<boolean> {
    if (Math.random() < 0.5) throw new Error('ProviderA failed');
    return true;
  }
}
