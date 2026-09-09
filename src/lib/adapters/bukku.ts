export class BukkuAdapter {
  private apiKey: string;
  private organization: string;
  private apiUrl: string;

  constructor(apiKey: string = process.env.BUKKU_API_KEY || 'MOCK_KEY') {
    this.apiKey = apiKey;
    this.organization = process.env.BUKKU_ORGANIZATION || 'RideSafe';
    this.apiUrl = (process.env.BUKKU_API_URL || '').replace(/\/$/, '');
  }

  /**
   * Mock fetching the latest location for a bus/vehicle.
   */
  async createInvoice(parentName: string, amount: number, dueDate?: Date) {
    if (this.apiKey === 'MOCK_KEY' || !process.env.BUKKU_API_KEY || !this.apiUrl) {
      return { success: false, error: new Error('Bukku API key and URL are not configured') }
    }

    try {
      const payload = {
        customer: parentName,
        amount: amount,
        due_date: dueDate?.toISOString(),
        description: "RideSafe Subscription Billing",
        organization: this.organization,
      };

      const res = await fetch(`${this.apiUrl}/v1/invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload)
        ,signal: AbortSignal.timeout(15_000)
      });
      
      if (!res.ok) throw new Error('Bukku API Error');
      const data = await res.json();
      
      return {
        success: true,
        invoiceId: data.invoice.id,
        status: 'PENDING',
        url: data.invoice.public_url
      };
    } catch (e) {
      console.error('[BukkuAdapter] Invoice Creation Failed', e);
      return { success: false, error: e };
    }
  }
}

export const bukkuAdapter = new BukkuAdapter();
