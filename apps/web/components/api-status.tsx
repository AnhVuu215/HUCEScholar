'use client';

import { useEffect, useState } from 'react';

type ConnectionState = 'loading' | 'healthy' | 'unavailable';

function isHealthResponse(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    value.status === 'ok' &&
    'service' in value &&
    value.service === 'hucescholar-api'
  );
}

export function ApiStatus() {
  const [state, setState] = useState<ConnectionState>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => controller.abort(), 8_000);

    async function checkConnection() {
      try {
        const response = await fetch('/api/v1/health', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Health request failed.');
        const body: unknown = await response.json();
        if (!isHealthResponse(body)) throw new Error('Unexpected health response.');
        if (!disposed) setState('healthy');
      } catch {
        if (!disposed) setState('unavailable');
      } finally {
        clearTimeout(timeout);
      }
    }

    void checkConnection();
    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  const labels: Record<ConnectionState, string> = {
    loading: 'Đang kiểm tra API…',
    healthy: 'API đang hoạt động',
    unavailable: 'Chưa kết nối được API',
  };

  return (
    <section className="connection" aria-labelledby="connection-heading">
      <div>
        <h2 id="connection-heading">Kết nối hệ thống</h2>
        <p>Kiểm tra kết nối từ web đến API trên cùng địa chỉ truy cập.</p>
      </div>
      <div className="connection-result">
        <p role="status" aria-live="polite" className={`connection-state state-${state}`}>
          <span className="state-dot" aria-hidden="true" />
          {labels[state]}
        </p>
        {state === 'unavailable' && (
          <>
            <p className="connection-help">Kiểm tra tiến trình API rồi thử kết nối lại.</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setState('loading');
                setAttempt((previous) => previous + 1);
              }}
            >
              Thử lại
            </button>
          </>
        )}
      </div>
      <p className="connection-note">
        Trạng thái này chỉ xác nhận API có phản hồi, chưa kiểm tra database, kho file hay email.
      </p>
    </section>
  );
}
