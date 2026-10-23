import { SCAN_ATTEMPTS, SCAN_BACKOFF_MS, ScanQueue } from '../src/files/scan-queue';
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
it('rides out a scanner outage of about half an hour before giving up', async () => {
  const add = jest.fn(async () => undefined);
  const service = Object.create(ScanQueue.prototype) as ScanQueue;
  Object.defineProperty(service, 'queue', { value: { add } });
  await service.enqueue('7');
  expect(add).toHaveBeenCalledWith(
    'scan',
    { fileId: '7' },
    expect.objectContaining({
      jobId: 'file-7',
      attempts: SCAN_ATTEMPTS,
      backoff: { type: 'exponential', delay: SCAN_BACKOFF_MS },
    }),
  );
  // Waits between tries: 15 s doubling, seven of them before the eighth and last try.
  const waits = Array.from({ length: SCAN_ATTEMPTS - 1 }, (_, n) => SCAN_BACKOFF_MS * 2 ** n);
  const minutes = waits.reduce((a, b) => a + b, 0) / 60_000;
  expect(minutes).toBeGreaterThan(30);
  expect(minutes).toBeLessThan(35);
});
it('removes the failed job before checking a file again', async () => {
  const order: string[] = [];
  const service = Object.create(ScanQueue.prototype) as ScanQueue;
  Object.defineProperty(service, 'queue', {
    value: {
      getJob: jest.fn(async () => ({ remove: async () => void order.push('remove') })),
      add: jest.fn(async () => void order.push('add')),
    },
  });
  await service.requeue('7');
  expect(order).toEqual(['remove', 'add']);
});
