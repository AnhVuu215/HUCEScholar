'use client';
import { materialTypes, type MaterialDraft } from '../../lib/materials';

export function MaterialReconciliation({
  latest,
  reconciled,
  confirm,
  useServer,
  disabled,
}: {
  latest: MaterialDraft;
  reconciled: boolean;
  confirm: (value: boolean) => void;
  useServer: () => void;
  disabled: boolean;
}) {
  const rows = [
    ['Tiêu đề', latest.title],
    ['Tác giả', latest.authors || 'Chưa ghi'],
    ['Loại học liệu', materialTypes[latest.materialType]],
    ['Mô tả', latest.description || 'Chưa ghi'],
    ['Nguồn tài liệu', latest.sourceReference || 'Chưa ghi'],
    ['Căn cứ quyền sử dụng', latest.rightsBasis || 'Chưa ghi'],
    ['Quyền tải', latest.downloadAllowed ? 'Cho phép tải' : 'Chỉ đọc trong hệ thống'],
    ['Môn liên quan', latest.courses.map((c) => `${c.code} · ${c.name}`).join('; ')],
  ];
  return (
    <section className="user-reconciliation" aria-label="Đối chiếu thông tin học liệu">
      <p role="alert" className="form-error">
        Thông tin học liệu đã đổi ở lượt khác. Bản soạn của bạn được giữ lại; đối chiếu trước khi
        lưu để tránh ghi đè thay đổi đó.
      </p>
      <h3>Thông tin hiện tại trên hệ thống · lần lưu {latest.revision}</h3>
      <details>
        <summary>Xem thông tin mới để đối chiếu</summary>
        <dl>
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </details>
      <label className="eligibility-check">
        <input
          type="checkbox"
          checked={reconciled}
          disabled={disabled}
          onChange={(event) => confirm(event.target.checked)}
        />
        <span>Tôi đã đối chiếu và muốn lưu nội dung đang nhập.</span>
      </label>
      <button type="button" className="secondary-button" disabled={disabled} onClick={useServer}>
        Dùng thông tin máy chủ
      </button>
    </section>
  );
}
