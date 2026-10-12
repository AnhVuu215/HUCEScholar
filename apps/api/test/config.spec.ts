import { parseEnvironment } from '../src/config';

describe('API environment', () => {
  it('binds to loopback with explicit development defaults', () => {
    expect(parseEnvironment({})).toEqual({ host: '127.0.0.1', port: 3001, nodeEnv: 'development' });
  });

  it.each(['1', '3001', '65535'])('accepts integer PORT=%s', (port) => {
    expect(parseEnvironment({ PORT: port }).port).toBe(Number(port));
  });

  it.each(['', '0', '65536', '-1', '1.5', '3001oops', ' 3001', '3e3', 'Infinity'])(
    'rejects invalid PORT=%s',
    (port) => {
      expect(() => parseEnvironment({ PORT: port })).toThrow('PORT');
    },
  );

  it.each(['development', 'test', 'production'])('accepts NODE_ENV=%s', (nodeEnv) => {
    expect(parseEnvironment({ NODE_ENV: nodeEnv }).nodeEnv).toBe(nodeEnv);
  });

  it.each(['', 'staging', 'prod'])('rejects unsupported NODE_ENV=%s', (nodeEnv) => {
    expect(() => parseEnvironment({ NODE_ENV: nodeEnv })).toThrow('NODE_ENV');
  });

  it('allows explicit container binding and rejects an empty host', () => {
    expect(parseEnvironment({ HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
    expect(() => parseEnvironment({ HOST: '' })).toThrow('HOST');
  });
});
