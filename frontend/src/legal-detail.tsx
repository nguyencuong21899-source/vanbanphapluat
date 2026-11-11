import { useEffect, useState } from 'react'
import { api, dateLabel, json, sourceLink, type Department, type LegalDocument, type User } from './api'
import { Actions, download, exportReport, labels, MatterForm, modes, ReportEditor, ReportView, SourceKindSelect,
  type Detail, type LibrarySource, type Person, type Action, type Run } from './legal-shared'

export function MatterDetail({ id, revision, user, departments, documents, aiEnabled, library, people, actions, busy, run, open }: {
  id: string; revision: number; user: User; departments: Department[]; documents: LegalDocument[]; aiEnabled: boolean;
  library: LibrarySource[]; people: Person[]; actions: Action[]; busy: boolean; run: Run; open: (id: string) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null), [error, setError] = useState(''), [tab, setTab] = useState('sources')
  const [actionSeed, setActionSeed] = useState({ title: '', legal_basis: '', report_id: '' })
  const path = '/legal/matters/' + id, canReview = ['admin', 'legal'].includes(user.role)
  useEffect(() => {
    let cancelled = false
    setDetail(null); setError('')
    api<Detail>(path).then(d => { if (!cancelled) setDetail(d) }).catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [path, revision])
  if (error) return <p className="error" role="alert">{error}</p>
  if (!detail) return <p role="status">Đang mở hồ sơ…</p>
  const latest = detail.reports[0]
  return <>
    <section className="panel legal-detail"><p className="eyebrow">{modes.find(m => m.key === detail.kind)?.title} · Phiên bản nguồn {detail.revision}</p>
      <h2>{detail.title}</h2><p>{detail.objective}</p><p><span className="badge">{labels[detail.status]}</span> · {labels[detail.visibility]}</p>
      <nav className="detail-tabs" aria-label="Chi tiết hồ sơ">{[['sources', '1. Hồ sơ và nguồn'], ['reports', '2. Kết quả và phê duyệt'],
        ['actions', '3. Kế hoạch hành động'], ['history', 'Lịch sử'], ['settings', 'Thông tin']].map(([key, title]) =>
          <button className={tab === key ? '' : 'secondary'} key={key} onClick={() => setTab(key)}>{title}</button>)}</nav>
    </section>
    {tab === 'sources' && <section className="panel">
      <h2>Nguồn làm căn cứ</h2><p className="muted">Chọn tài liệu pháp luật, SOP, hợp đồng và mẫu chuẩn cần đối chiếu. Link đơn lẻ chưa cung cấp toàn văn cho Agent.</p>
      {detail.sources.map(s => <details className="source-item" key={s.id}><summary>{s.title} · {labels[s.kind]}</summary>
        {sourceLink(s.source_url) && <a href={sourceLink(s.source_url)!} target="_blank" rel="noreferrer">Mở nguồn ↗</a>}
        <pre>{s.content || 'Chưa có nội dung; bổ sung toàn văn hoặc trích đoạn trong nguồn mới.'}</pre>
        {s.has_file && <button className="secondary" disabled={busy} onClick={() => run(async () => {
          download(s.filename || 'tai-lieu', await api<Blob>('/legal/sources/' + s.id + '/file'))
        }, 'Đã tải tệp.')}>Tải bản gốc</button>}</details>)}
      {!detail.sources.length && <p>Chưa có nguồn. Thêm tệp hoặc nhập nguồn bên dưới.</p>}
      {detail.can_edit && <>
        <form className="subsection" onSubmit={e => { e.preventDefault(); const f = e.currentTarget; const body = new FormData(f)
          const kind = body.get('kind'); body.delete('kind')
          void run(async () => { await api(path + '/files?kind=' + kind, { method: 'POST', body }); f.reset() })
        }}><h3>Thêm tệp vào hồ sơ</h3><div className="form-grid"><SourceKindSelect />
          <label>Tệp PDF / DOCX / TXT / MD<input name="file" type="file" accept=".pdf,.docx,.txt,.md" required /></label></div><button disabled={busy}>Lưu tệp</button></form>
        <form className="subsection" onSubmit={e => { e.preventDefault(); const f = e.currentTarget; const data = Object.fromEntries(new FormData(f))
          void run(async () => { await api(path + '/sources', json('POST', { ...data, source_url: data.source_url || null })); f.reset() })
        }}><h3>Nhập nội dung hoặc đường link</h3><div className="form-grid"><label>Tên nguồn<input name="title" required minLength={3} maxLength={500} /></label>
          <SourceKindSelect /><label>Đường link<input name="source_url" type="url" /></label></div>
          <label>Nội dung / trích đoạn có số điều, trang<textarea name="content" rows={5} maxLength={65000} /></label><button disabled={busy}>Thêm nguồn</button></form>
        <form className="subsection" onSubmit={e => { e.preventDefault(); const docid = new FormData(e.currentTarget).get('document_id')
          void run(async () => { await api(path + '/sources', json('POST', { title: 'Nhập từ danh mục', kind: 'LEGAL', document_id: docid })) })
        }}><h3>Lấy từ danh mục VBPL</h3><label>Văn bản<select name="document_id" required><option value="">Chọn văn bản</option>
          {documents.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label><button disabled={busy}>Lưu bản chụp nguồn vào hồ sơ</button></form>
        <form className="subsection" onSubmit={e => { e.preventDefault(); const sourceid = new FormData(e.currentTarget).get('reuse_source_id')
          void run(async () => { await api(path + '/sources', json('POST', { title: 'Tái sử dụng nguồn', kind: 'INTERNAL', reuse_source_id: sourceid })) })
        }}><h3>Tái sử dụng tài liệu từ kho</h3><label>Tài liệu<select name="reuse_source_id" required><option value="">Chọn nguồn được phép xem</option>
          {library.filter(s => s.matter_id !== detail.id).map(s => <option key={s.id} value={s.id}>{s.title} · {s.matter_title}</option>)}</select></label>
          <button disabled={busy}>Sao chép nội dung nguồn</button><p className="muted">Mỗi bản chụp độc lập; chuyển sang phạm vi rộng hơn cần Pháp chế thực hiện.</p></form>
      </>}
    </section>}
    {tab === 'reports' && <>
      {detail.can_edit && <section className="panel"><h2>Chạy Agent trên hồ sơ này</h2>
        <p>Agent đề xuất kết quả từ {detail.sources.length} nguồn đã cung cấp. Căn cứ, hiệu lực và kết luận cần chuyên môn xác minh.</p>
        {!aiEnabled && <p className="muted">Gemini chưa được cấu hình. Anh/chị có thể viết và lưu báo cáo thủ công bên dưới.</p>}
        <form onSubmit={e => { e.preventDefault(); void run(async () => {
          await api(path + '/generate', json('POST', { revision: detail.revision, approved_for_external_ai: true }))
        }, 'Agent đã tạo bản làm việc để rà soát.') }}>
          <label className="check"><input type="checkbox" required disabled={!aiEnabled || busy} />Tôi xác nhận nội dung hồ sơ, tất cả nguồn và mô tả phòng ban được phép gửi tới Gemini.</label>
          <button disabled={busy || !aiEnabled || !detail.sources.length}>{busy ? 'Đang xử lý…' : 'Tạo kết quả bằng Agent'}</button></form>
        <details className="subsection"><summary>Viết hoặc chỉnh báo cáo trước khi duyệt</summary>
          <ReportEditor key={latest?.id || 'new'} result={latest?.result} sources={detail.sources} busy={busy} onSave={result =>
            run(async () => { await api(path + '/reports', json('POST', { revision: detail.revision, result })) }, 'Đã lưu phiên bản báo cáo mới, chờ duyệt.')} /></details>
      </section>}
      {!detail.reports.length && <section className="panel">Chưa có báo cáo. Thêm nguồn rồi chạy Agent hoặc viết báo cáo thủ công.</section>}
      {detail.reports.map((r, index) => <section className="panel" key={r.id}><div className="section-title">
        <h2>{index === 0 ? 'Kết quả mới nhất' : 'Phiên bản trước'}</h2><span className="badge">{labels[r.state]}</span></div>
        <p className="muted">{dateLabel(r.created_at)} · {r.provider === 'HUMAN' ? 'Người dùng biên soạn' : r.provider}
          {r.context_revision !== detail.revision && ' · Nguồn đã thay đổi, cần đánh giá lại'}</p>
        <ReportView report={r.result} sources={detail.sources} onAction={canReview && index === 0 && r.state === 'APPROVED' && r.context_revision === detail.revision ? finding => {
          setActionSeed({ title: finding.recommendation.slice(0, 3000), legal_basis: [finding.clause, finding.finding,
            ...finding.citations.map(c => c.locator + ': ' + c.quote)].join('\n').slice(0, 3000), report_id: r.id }); setTab('actions')
        } : undefined} />
        {r.review_note && <p>Người duyệt: {r.reviewer} · {r.review_note}</p>}
        <button className="secondary" onClick={() => exportReport(detail, r)}>Tải báo cáo (.txt)</button>
        {canReview && index === 0 && r.state === 'PENDING' && r.context_revision === detail.revision && <form className="subsection" onSubmit={e => {
          e.preventDefault(); const body = Object.fromEntries(new FormData(e.currentTarget))
          void run(async () => { await api(path + '/reports/' + r.id + '/review', json('POST', body)) })
        }}><h3>Rà soát và phê duyệt</h3><label>Ý kiến và phạm vi đã kiểm tra<textarea name="note" required minLength={3} maxLength={5000} /></label>
          <label>Quyết định<select name="decision"><option value="APPROVED">Duyệt để tái sử dụng trong phạm vi hồ sơ</option><option value="REJECTED">Yêu cầu sửa</option></select></label>
          <button disabled={busy}>Lưu quyết định</button></form>}
      </section>)}
    </>}
    {tab === 'actions' && <section className="panel"><h2>Kế hoạch hành động</h2>
      {canReview && <form key={actionSeed.title + actionSeed.report_id} onSubmit={e => { e.preventDefault(); const f = e.currentTarget; const d = Object.fromEntries(new FormData(f))
        void run(async () => { await api(path + '/actions', json('POST', { ...d, report_id: d.report_id || null })); f.reset() })
      }}><div className="form-grid"><label>Việc cần làm<input name="title" defaultValue={actionSeed.title} minLength={3} maxLength={3000} required /></label>
        <label>Người phụ trách<select name="assignee_id" required><option value="">Chọn người có quyền xem hồ sơ</option>{people.map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select></label>
        <label>Hạn nội bộ<input name="due_on" type="date" required /></label><label>Ưu tiên<select name="priority"><option value="MEDIUM">Trung bình</option><option value="HIGH">Cao</option><option value="LOW">Thấp</option></select></label>
        <label>Báo cáo căn cứ<select name="report_id" defaultValue={actionSeed.report_id}><option value="">Giao việc trực tiếp</option>{detail.reports.filter((r, i) => i === 0 && r.state === 'APPROVED' && r.context_revision === detail.revision).map(r =>
          <option key={r.id} value={r.id}>Báo cáo {dateLabel(r.created_at)}</option>)}</select></label></div>
        <label>Căn cứ / điều khoản / phát hiện<textarea name="legal_basis" defaultValue={actionSeed.legal_basis} maxLength={3000} /></label><button disabled={busy}>Giao nghĩa vụ</button></form>}
      <Actions items={actions.filter(a => a.matter_id === id)} user={user} busy={busy} open={open} run={run} />
    </section>}
    {tab === 'history' && <section className="panel"><h2>Lịch sử truy cập và xử lý</h2>{detail.history.map((h, i) =>
      <details key={i}><summary>{dateLabel(h.created_at)} · {h.actor} · {h.action}</summary><pre>{JSON.stringify(h.detail, null, 2)}</pre></details>)}</section>}
    {tab === 'settings' && (detail.can_edit ? <MatterForm key={detail.revision} matter={detail} kind={detail.kind} user={user}
      departments={departments} busy={busy} onCancel={() => setTab('sources')} onSave={data => run(async () => {
        await api(path, json('PUT', { ...(data as object), revision: detail.revision }))
      }, 'Đã cập nhật hồ sơ. Báo cáo cũ được giữ lại để đối chiếu.')} /> : <section className="panel"><pre>{detail.context || 'Chưa bổ sung bối cảnh.'}</pre></section>)}
  </>
}
