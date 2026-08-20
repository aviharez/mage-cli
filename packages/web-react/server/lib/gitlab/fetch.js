import http from 'http';
import https from 'https';

export const insecureFetch = (urlString, options = {}) => new Promise((resolve, reject) => {
  const url = new URL(urlString);
  const transport = url.protocol === 'http:' ? http : https;
  const body = options.body instanceof URLSearchParams
    ? options.body.toString()
    : typeof options.body === 'string' ? options.body : null;
  const request = transport.request(url, {
    method: options.method ?? 'GET',
    headers: options.headers,
    rejectUnauthorized: false,
  }, (response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode,
        statusText: response.statusMessage ?? '',
        headers: new Headers(response.headers),
        text: async () => text,
        json: async () => JSON.parse(text),
      });
    });
  });
  if (options.signal) {
    const abort = () => request.destroy(options.signal.reason);
    if (options.signal.aborted) abort();
    else options.signal.addEventListener('abort', abort, { once: true });
  }
  request.on('error', reject);
  if (body) request.write(body);
  request.end();
});