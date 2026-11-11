import { api, dateLabel, json } from './api'
import { useState } from 'react'
import type { Department, User } from './api'
export type LegalSection = 'workbench' | 'library' | 'knowledge' | 'obligations'
export type Kind = 'CASE' | 'CHANGE' | 'RESEARCH' | 'REVIEW' | 'DRAFT' | 'KNOWLEDGE'
export const modes: { key: Kind; title: string; description: string }[] = [
  { key: 'CASE', title: 'Phân tích vụ việc', description: 'Hồ sơ → vấn đề → phương án xử lý' },
  { key: 'CHANGE', title: 'Đánh giá thay đổi', description: 'VBPL mới → tác động → việc cần làm' },
  { key: 'RESEARCH', title: 'Tra cứu và nghiên cứu', description: 'Hỏi đáp có căn cứ từ nguồn hồ sơ' },
  { key: 'REVIEW', title: 'Rà soát tuân thủ', description: 'Hợp đồng, SOP và playbook nội bộ' },
  { key: 'DRAFT', title: 'Soạn thảo và góp ý', description: 'Bản nháp, công văn, góp ý dự thảo' },
  { key: 'KNOWLEDGE', title: 'Hỏi đáp nội bộ', description: 'Quy định, quy trình và biểu mẫu' },
]
export const labels: Record<string, string> = {
  PRIVATE: 'Riêng chủ hồ sơ và Pháp chế', DEPARTMENT: 'Trong phòng ban', COMPANY: 'Toàn công ty',
  OPEN: 'Đang chuẩn bị', IN_REVIEW: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Cần sửa', PENDING: 'Chờ duyệt',
  LEGAL: 'Căn cứ pháp luật', INTERNAL: 'Quy trình / quy chế nội bộ', CONTRACT: 'Hợp đồng',
  EVIDENCE: 'Hồ sơ / chứng từ', PLAYBOOK: 'Playbook / mẫu chuẩn',
  MATCH: 'Phù hợp', CONFLICT: 'Xung đột', MISSING: 'Thiếu', OUTDATED: 'Lỗi thời', UNCERTAIN: 'Chưa rõ',
  IN_PROGRESS: 'Đang thực hiện', SUBMITTED: 'Chờ duyệt bằng chứng', DONE: 'Đã hoàn thành',
  HIGH: 'Cao', MEDIUM: 'Trung bình', LOW: 'Thấp',
}
export type Matter = { id: string; title: string; kind: Kind; objective: string; context: string; visibility: string;
  department_id: string | null; owner_id: string; owner?: string; revision: number; status: string; source_count?: number }
export type Source = { id: string; title: string; kind: string; source_url: string | null; content: string; has_file: boolean; filename: string | null; digest: string }
export type Finding = { category: string; clause: string; finding: string; recommendation: string; department: string;
  citations: { source_id: string; quote: string; locator: string }[] }
export type Result = { summary: string; questions: string[]; findings: Finding[]; draft: string; limitations: string }
export type Report = { id: string; result: Result; state: string; context_revision: number; created_at: string; provider: string; reviewer: string | null; review_note: string | null }
export type Detail = Matter & { can_edit: boolean; sources: Source[]; reports: Report[]; history: { actor: string; action: string; created_at: string; detail: unknown }[] }
export type Action = { id: string; matter_id: string; matter_title: string; title: string; assignee: string; assignee_id: string;
  legal_basis: string; due_on: string; priority: string; status: string; evidence: string; revision: number; review_note: string | null }
export type Person = { id: string; display_name: string; department_id: string | null }
export type LibrarySource = Source & { matter_id: string; matter_title: string; visibility: string }
export type Knowledge = { id: string; matter_id: string; title: string; visibility: string; reviewer: string; reviewed_at: string; result: Result }
export type Run = (action: () => Promise<void>, message?: string) => Promise<void>
export const todayVN = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function exportReport(m: Detail, r: Report) {
  const text = [m.title, 'BẢN LÀM VIỆC · ' + labels[r.state] + ' · ' + dateLabel(r.created_at),
    'Người duyệt: ' + (r.reviewer || 'Chưa duyệt'), 'Ý kiến: ' + (r.review_note || '—'), r.result.summary,
    'DỮ KIỆN CẦN BỔ SUNG', ...r.result.questions,
    ...r.result.findings.map(f => [labels[f.category] + ' · ' + f.clause, f.finding, 'Đề xuất: ' + f.recommendation,
      'Phòng ban đề xuất: ' + f.department, ...f.citations.map(c => {
        const s = m.sources.find(s => s.id === c.source_id)
        return '[' + (s?.title || c.source_id) + ' · ' + c.locator + '] ' + c.quote + '\n' + (s?.source_url || '')
      })].join('\n')), 'BẢN NHÁP', r.result.draft, 'GIỚI HẠN', r.result.limitations].join('\n\n')
  download('bao-cao-phap-ly.txt', new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' }))
}
export function SourceKindSelect() {
  return <label>Loại nguồn<select name="kind">{['LEGAL', 'INTERNAL', 'CONTRACT', 'EVIDENCE', 'PLAYBOOK'].map(k => <option key={k} value={k}>{labels[k]}</option>)}</select></label>
}
export function MatterForm({ matter, kind, user, departments, busy, onCancel, onSave }: {
  matter?: Matter; kind: Kind; user: User; departments: Department[]; busy: boolean; onCancel: () => void; onSave: (data: unknown) => Promise<void>;
}) {
  return <form className="panel legal-create" onSubmit={e => {
    e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget))
    void onSave({ ...data, department_id: data.department_id || null })
  }}><div className="section-title"><h2>{matter ? 'Thông tin hồ sơ' : 'Mở hồ sơ làm việc'}</h2><button type="button" className="secondary" onClick={onCancel}>Đóng</button></div>
    <div className="form-grid"><label>Tên hồ sơ<input name="title" defaultValue={matter?.title} required minLength={3} maxLength={300} /></label>
      <label>Agent / quy trình<select name="kind" defaultValue={kind}>{modes.map(m => <option key={m.key} value={m.key}>{m.title}</option>)}</select></label>
      <label>Phạm vi truy cập<select name="visibility" defaultValue={matter?.visibility || 'PRIVATE'}>
        <option value="PRIVATE">{labels.PRIVATE}</option><option value="DEPARTMENT">{labels.DEPARTMENT}</option>
        {(['admin', 'legal'].includes(user.role) || matter?.visibility === 'COMPANY') && <option value="COMPANY">{labels.COMPANY}</option>}</select></label>
      <label>Phòng ban liên quan<select name="department_id" defaultValue={matter?.department_id || user.department_id || ''}><option value="">Chưa chọn</option>
        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div>
    <label>Mục tiêu / câu hỏi cần giải quyết<textarea name="objective" defaultValue={matter?.objective} required minLength={3} maxLength={6000} rows={3} /></label>
    <label>Bối cảnh công ty, sản phẩm, nhà máy, dữ kiện đã biết<textarea name="context" defaultValue={matter?.context} maxLength={10000} rows={3} /></label>
    <p className="muted">Phạm vi áp dụng cho toàn bộ nguồn và báo cáo trong hồ sơ. Pháp chế và quản trị có quyền rà soát.</p>
    <button disabled={busy}>{busy ? 'Đang lưu…' : matter ? 'Lưu phiên bản mới' : 'Tạo hồ sơ'}</button>
  </form>
}
export function ReportView({ report, sources, onAction }: { report: Result; sources: Source[]; onAction?: (finding: Finding) => void }) {
  return <div className="report-body"><h3>Nhận định và phương án</h3><p className="pre">{report.summary}</p>
    {report.questions.length > 0 && <><h3>Dữ kiện cần bổ sung</h3><ul>{report.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></>}
    {report.findings.length > 0 && <><h3>Ma trận phát hiện</h3><div className="table-wrap"><table><thead><tr><th>Điều khoản / mức đánh giá</th><th>Phát hiện và căn cứ</th><th>Kiến nghị</th></tr></thead>
      <tbody>{report.findings.map((f, i) => <tr key={i}><td><span className="badge">{labels[f.category]}</span><p>{f.clause}</p></td>
        <td><p className="pre">{f.finding}</p>{f.citations.map((c, j) => <blockquote key={j}><p>{c.quote}</p><small>{sources.find(s => s.id === c.source_id)?.title || c.source_id} · {c.locator}</small></blockquote>)}</td>
        <td><p className="pre">{f.recommendation}</p><small>Phòng ban đề xuất: {f.department || 'Cần xác nhận'}</small>
          {onAction && <p><button className="secondary" onClick={() => onAction(f)}>Lập công việc từ phát hiện</button></p>}</td></tr>)}</tbody></table></div></>}
    {report.draft && <><h3>Bản nháp để rà soát</h3><pre>{report.draft}</pre></>}
    <h3>Giới hạn và nội dung cần xác minh</h3><p className="pre">{report.limitations}</p>
  </div>
}
export function ReportEditor({ result, sources, busy, onSave }: { result?: Result; sources: Source[]; busy: boolean; onSave: (data: Result) => Promise<void> }) {
  const [findings, setFindings] = useState(result?.findings || [])
  return <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget)
    void onSave({ summary: String(f.get('summary')), questions: String(f.get('questions')).split('\n').map(s => s.trim()).filter(Boolean),
      draft: String(f.get('draft')), limitations: String(f.get('limitations')), findings })
  }}><label>Nhận định / phương án<textarea name="summary" rows={5} defaultValue={result?.summary} required minLength={3} maxLength={15000} /></label>
    <label>Câu hỏi còn thiếu (mỗi dòng một câu)<textarea name="questions" defaultValue={result?.questions.join('\n')} maxLength={30000} /></label>
    {findings.map((f, i) => <fieldset key={i}><legend>Phát hiện {i + 1} · {labels[f.category]}</legend>
      <label>Đánh giá<select value={f.category} onChange={e => {
        const category = e.target.value; setFindings(rows => rows.map((row, j) => i === j ? { ...row, category } : row))
      }}>{['MATCH', 'CONFLICT', 'MISSING', 'OUTDATED', 'UNCERTAIN'].map(k => <option key={k} value={k}>{labels[k]}</option>)}</select></label>
      {(['clause', 'finding', 'recommendation', 'department'] as const).map(key => <label key={key}>{{ clause: 'Điều khoản', finding: 'Phát hiện', recommendation: 'Kiến nghị', department: 'Phòng ban đề xuất' }[key]}
        <textarea value={f[key]} maxLength={key === 'department' ? 300 : key === 'clause' ? 500 : 3000} onChange={e => {
          const value = e.target.value; setFindings(rows => rows.map((row, j) => i === j ? { ...row, [key]: value } : row))
        }} /></label>)}
      {f.citations.map((c, ci) => <fieldset key={ci}><legend>Căn cứ {ci + 1}</legend>
        <label>Nguồn trích dẫn<select required value={c.source_id} onChange={e => {
          const source_id = e.target.value; setFindings(rows => rows.map((row, j) => j === i ? { ...row, citations: row.citations.map((x, n) => n === ci ? { ...x, source_id } : x) } : row))
        }}><option value="">Chọn nguồn</option>{sources.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        {(['quote', 'locator'] as const).map(key => <label key={key}>{key === 'quote' ? 'Trích nguyên văn từ nguồn' : 'Điều / trang / đoạn'}
          <textarea value={c[key]} required minLength={key === 'quote' ? 5 : 1} maxLength={key === 'quote' ? 1200 : 300} onChange={e => {
            const value = e.target.value; setFindings(rows => rows.map((row, j) => j === i ? { ...row, citations: row.citations.map((x, n) => n === ci ? { ...x, [key]: value } : x) } : row))
          }} /></label>)}
        <button type="button" className="secondary" onClick={() => setFindings(rows => rows.map((row, j) => j === i ? { ...row, citations: row.citations.filter((_, n) => n !== ci) } : row))}>Bỏ căn cứ</button>
      </fieldset>)}
      <div className="actions"><button type="button" className="secondary" disabled={f.citations.length >= 10} onClick={() =>
        setFindings(rows => rows.map((row, j) => j === i ? { ...row, citations: [...row.citations, { source_id: '', quote: '', locator: '' }] } : row))}>+ Thêm căn cứ</button>
      <button type="button" className="secondary" onClick={() => setFindings(rows => rows.filter((_, j) => i !== j))}>Bỏ phát hiện khỏi bản mới</button></div>
    </fieldset>)}
    <button type="button" className="secondary" disabled={findings.length >= 50} onClick={() => setFindings(rows =>
      [...rows, { category: 'UNCERTAIN', clause: '', finding: '', recommendation: '', department: '', citations: [] }])}>+ Thêm phát hiện vào ma trận</button>
    <label>Bản nháp văn bản<textarea name="draft" rows={6} defaultValue={result?.draft} maxLength={30000} /></label>
    <label>Giới hạn / phần cần xác minh<textarea name="limitations" defaultValue={result?.limitations || 'Chưa xác minh hiệu lực tại nguồn chính thức; cần chuyên môn rà soát trước khi áp dụng.'} required minLength={3} maxLength={5000} /></label>
    <button disabled={busy}>Lưu bản mới chờ duyệt</button>
  </form>
}
export function Actions({ items, user, busy, open, run }: { items: Action[]; user: User; busy: boolean; open: (id: string) => void; run: Run }) {
  const reviewer = ['admin', 'legal'].includes(user.role), today = todayVN()
  return <div className="action-list">{!items.length && <p>Chưa có nghĩa vụ phù hợp.</p>}{items.map(item => <article className="result" key={item.id}>
    <div className="section-title"><h3>{item.title}</h3><span className={item.status !== 'DONE' && item.due_on < today ? 'badge overdue' : 'badge'}>
      {item.status === 'OPEN' ? 'Chưa bắt đầu' : labels[item.status]}{item.status !== 'DONE' && item.due_on < today ? ' · Quá hạn' : ''}</span></div>
    <p><button className="text-button" onClick={() => open(item.matter_id)}>{item.matter_title}</button></p>
    <p>{item.assignee} · Hạn nội bộ: {dateLabel(item.due_on)} · Ưu tiên {labels[item.priority]}</p>
    {item.legal_basis && <p className="pre">Căn cứ: {item.legal_basis}</p>}
    {(reviewer || item.assignee_id === user.id) && item.status !== 'DONE' ? <form key={item.revision} onSubmit={e => {
      e.preventDefault(); const data = Object.fromEntries(new FormData(e.currentTarget))
      void run(async () => { await api('/legal/actions/' + item.id, json('PATCH', { ...data, revision: item.revision })) })
    }}><label>Bằng chứng / mã hồ sơ / đường dẫn tài liệu<textarea name="evidence" defaultValue={item.evidence} maxLength={6000} readOnly={reviewer && item.status === 'SUBMITTED'} /></label>
      <div className="form-grid"><label>Trạng thái<select name="status" defaultValue={item.status}>
        <option value="OPEN">Chưa bắt đầu</option><option value="IN_PROGRESS">Đang thực hiện</option><option value="SUBMITTED">Nộp bằng chứng để duyệt</option>
        {reviewer && item.status === 'SUBMITTED' && <option value="DONE">Duyệt hoàn thành</option>}</select></label>
        {reviewer && <label>Ý kiến rà soát<input name="review_note" maxLength={3000} /></label>}</div><button disabled={busy}>Cập nhật công việc</button>
    </form> : <><p className="pre">{item.evidence || 'Chưa nộp bằng chứng.'}</p>{item.review_note && <p>Ý kiến duyệt: {item.review_note}</p>}</>}
  </article>)}</div>
}
