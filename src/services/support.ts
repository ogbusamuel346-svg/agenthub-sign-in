import { apiRequest } from './apiClient';

export type SupportComplaintInput = {
  email: string;
  reference?: string;
  message: string;
  website?: string;
};

export async function submitSupportComplaint(input: SupportComplaintInput): Promise<void> {
  await apiRequest<{ ok: boolean }>('/api/cloudflare/support/complaints', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
