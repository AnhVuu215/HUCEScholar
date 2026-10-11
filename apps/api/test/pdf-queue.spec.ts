import { ScanQueue } from '../src/files/scan-queue';
it('bounds enqueue when Redis never acknowledges the operation', async () => {
  jest.useFakeTimers();
  const service = Object.create(ScanQueue.prototype) as ScanQueue;
  Object.defineProperty(service, 'queue', {
    value: { add: jest.fn(() => new Promise(() => undefined)) },
  });
  let settled = false;
  void service.enqueue('1').catch(() => {
    settled = true;
  });
  try {
    await jest.advanceTimersByTimeAsync(3000);
    expect(settled).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});
