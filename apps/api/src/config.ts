export interface ApiEnvironment {
  host: string;
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
}

export function parseEnvironment(input: NodeJS.ProcessEnv): ApiEnvironment {
  const rawPort = input.PORT ?? '3001';
  if (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }

  const nodeEnv = input.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('NODE_ENV must be development, test or production.');
  }

  const host = input.HOST ?? '127.0.0.1';
  if (!host || host.trim() !== host || /[\s/]/.test(host)) {
    throw new Error('HOST must be a non-empty hostname or IP address.');
  }

  return { host, port: Number(rawPort), nodeEnv };
}
