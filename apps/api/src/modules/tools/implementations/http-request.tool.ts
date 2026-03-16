import axios from 'axios';

const BLOCKED_HOSTS = ['169.254.169.254', '::1', 'localhost', '0.0.0.0'];

export async function httpRequestTool(input: Record<string, unknown>): Promise<string> {
  const { url, method = 'GET', headers = {}, body } = input as {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  };

  if (!url) throw new Error('url is required');

  // Basic SSRF protection
  try {
    const parsed = new URL(url);
    if (BLOCKED_HOSTS.some((h) => parsed.hostname.includes(h))) {
      throw new Error('Blocked host');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP/HTTPS allowed');
    }
  } catch (err: any) {
    throw new Error(`Invalid URL: ${err.message}`);
  }

  const resp = await axios({
    url,
    method: method.toUpperCase() as any,
    headers,
    data: body,
    timeout: 15000,
    maxContentLength: 500_000, // 500KB limit
    validateStatus: () => true,
  });

  return JSON.stringify({
    status: resp.status,
    headers: resp.headers,
    body: typeof resp.data === 'string' ? resp.data.slice(0, 10000) : resp.data,
  });
}
