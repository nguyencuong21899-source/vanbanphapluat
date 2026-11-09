import { useEffect, useState, type FormEvent } from 'react'
import { api, dateLabel, json, sourceLink, statuses, type Department, type LegalDocument, type User } from './api'
import { Administration, TaskList } from './management'

type Page = 'documents' | 'drafts' | 'analysis' | 'tasks' | 'overview' | 'admin' | 'trash'
type Analysis = { id: string; result: string; created_at: string; provider: string; current_file: boolean }
type Audit = { actor: string; action: string; created_at: string; detail: Record<string, unknown> }
const fields = [
  ['internal_code', 'Mã nội bộ'], ['title', 'Tên văn bản'], ['reference_number', 'Số hiệu'],
  ['document_type', 'Loại văn bản'], ['issuing_authority', 'Cơ quan ban hành'], ['source_url', 'Đường link nguồn'],
  ['issued_on', 'Ngày ban hành'], ['effective_on', 'Ngày hiệu lực'], ['expires_on', 'Ngày hết hiệu lực'],
  ['comment_deadline', 'Hạn góp ý'], ['primary_domain', 'Lĩnh vực'],
] as const

function Editor({ doc, departments, canReview, onClose, onSave }: {
  doc: LegalDocument | null; departments: Department[]; canReview: boolean; onClose: () => void;
  onSave: (doc: LegalDocument) => void;
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const data = Object.fromEntries(fields.map(([key]) => [key, String(form.get(key) || '').trim() || null]))
    setBusy(true)
    setError('')
    try {
      onSave(await api<LegalDocument>(doc ? '/documents/' + doc.id : '/documents', json(doc ? 'PUT' : 'POST', {
        ...data, internal_code: data.internal_code || 'VB-' + cryptoRandom(), title: data.title || data.source_url,
        document_type: data.document_type || 'Chưa phân loại',
        legal_status: form.get('legal_status') || doc?.legal_status || 'UNVERIFIED',
        applicability: doc?.applicability || 'UNVERIFIED', revision: doc?.updated_at,
        departments: form.getAll('departments'), notes: form.get('notes') || null,
      })))
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="panel">
    <div className="section-title"><h2>{doc ? 'Chỉnh sửa văn bản' : 'Thêm văn bản'}</h2><button className="secondary" onClick={onClose}>Đóng</button></div>
    <form onSubmit={save}>
      <div className="form-grid">{fields.map(([key, label]) => <label key={key}>{label}
        <input name={key} defaultValue={doc?.[key] || ''} required={key === 'title' && !!doc}
          maxLength={key === 'title' ? 1000 : key === 'source_url' ? 2083 : 100}
          type={key === 'source_url' ? 'url' : key.endsWith('_on') || key === 'comment_deadline' ? 'date' : 'text'} />
      </label>)}
      {canReview && <label>Tình trạng pháp lý<select name="legal_status" defaultValue={doc?.legal_status || 'UNVERIFIED'}>
        {Object.entries(statuses).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
      </select></label>}
      <label>Phòng ban<select name="departments" multiple defaultValue={doc?.departments || []}>
        {[...new Set([...departments.map(d => d.name), ...(doc?.departments || [])])].map(name => <option key={name}>{name}</option>)}
      </select></label></div>
      <label>Ghi chú<textarea name="notes" maxLength={10000} defaultValue={doc?.notes || ''} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu văn bản'}</button>
    </form>
  </section>
}

function cryptoRandom() {
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), value => value.toString(16).padStart(2, '0')).join('')
}

function Batch({ onSaved }: { onSaved: () => void }) {
  const [input, setInput] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    const links = [...new Set(input.split(/\r?\n/).map(value => value.trim()).filter(Boolean))]
    if (!links.length || links.length > 50) { setResult('Nhập từ 1 đến 50 đường link mỗi lần.'); return }
    setBusy(true)
    const failures = [], messages = []
    for (const link of links) {
      try {
        if (!sourceLink(link)) throw new Error('Đường link phải bắt đầu bằng HTTP hoặc HTTPS')
        await api('/documents', json('POST', { internal_code: 'VB-' + cryptoRandom(), title: link.slice(0, 1000),
          document_type: 'Chưa phân loại', source_url: link }))
      } catch (error) { failures.push(link); messages.push(link + ' — ' + (error as Error).message) }
    }
    setBusy(false)
    setInput(failures.join('\n'))
    setResult(['Đã lưu ' + (links.length - failures.length) + '/' + links.length + ' đường link.', ...messages].join('\n'))
    onSaved()
  }
  return <form className="panel" onSubmit={submit}><h2>Nhập nhiều đường link</h2>
    <label>Mỗi dòng một URL<textarea rows={5} value={input} onChange={event => setInput(event.target.value)} required /></label>
    <button disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu danh sách'}</button>
    {result && <p className="pre" role="status">{result}</p>}
  </form>
}

function Detail({ doc, canEdit, canReview, aiEnabled, showAI, refresh }: {
  doc: LegalDocument; canEdit: boolean; canReview: boolean; aiEnabled: boolean; showAI: boolean; refresh: () => void;
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [consent, setConsent] = useState(false)
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [history, setHistory] = useState<Audit[]>([])
  const [preview, setPreview] = useState('')
  const [previewText, setPreviewText] = useState('')
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  async function run(action: () => Promise<void>) {
    setError(''); setBusy(true)
    try { await action() } catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  const path = '/documents/' + doc.id
  const link = sourceLink(doc.source_url)
  useEffect(() => {
    if (showAI && !doc.archived_at) api<Analysis[]>(path + '/analyses').then(setAnalyses).catch(error => setError(error.message))
  }, [path, showAI, doc.archived_at])
  return <article className="panel detail">
    <p className="eyebrow">{doc.reference_number || doc.internal_code}</p><h2>{doc.title}</h2>
    <p><span className="badge">{statuses[doc.legal_status]}</span> {doc.document_type} · {doc.issuing_authority || 'Chưa rõ cơ quan ban hành'}</p>
    <p>Ban hành {dateLabel(doc.issued_on)} · Hiệu lực {dateLabel(doc.effective_on)} · Hạn góp ý {dateLabel(doc.comment_deadline)}</p>
    <p>{doc.departments.join(', ') || 'Chưa phân công phòng ban'}</p>
    {doc.notes && <p className="pre">{doc.notes}</p>}
    {link && <p><a href={link} target="_blank" rel="noreferrer">Mở văn bản tại nguồn ↗</a></p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions">
      <button className="secondary" disabled={busy} onClick={() => run(async () => setHistory(await api<Audit[]>(path + '/history')))}>Xem lịch sử</button>
      {doc.has_file && !doc.archived_at && <>
        <button className="secondary" disabled={busy} onClick={() => run(async () => {
          const file = await api<Blob>(path + '/file')
          if (file.type === 'application/pdf') setPreview(URL.createObjectURL(file))
          else setPreviewText((await api<{ text: string }>(path + '/preview')).text)
        })}>Xem tệp</button>
        <button className="secondary" disabled={busy} onClick={() => run(async () => {
          const url = URL.createObjectURL(await api<Blob>(path + '/file'))
          const anchor = document.createElement('a')
          anchor.href = url; anchor.download = doc.source_filename || 'van-ban'
          anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
        })}>Tải tệp</button>
      </>}
    </div>
    {preview && <><button className="secondary" onClick={() => setPreview('')}>Đóng bản xem trước</button><iframe title="Bản PDF" src={preview} /></>}
    {previewText && <><button className="secondary" onClick={() => setPreviewText('')}>Đóng bản xem trước</button><pre>{previewText}</pre></>}
    {canEdit && !doc.archived_at && <form className="inline" onSubmit={event => {
      event.preventDefault()
      const form = event.currentTarget
      const body = new FormData(form)
      void run(async () => { await api(path + '/file', { method: 'POST', body }); form.reset(); refresh() })
    }}><label>Đính kèm tệp<input name="file" type="file" accept=".pdf,.docx,.txt,.md" required /></label>
      <button disabled={busy}>Lưu tệp</button></form>}
    {canReview && !doc.archived_at && <form className="inline" onSubmit={event => {
      event.preventDefault()
      const form = new FormData(event.currentTarget)
      void run(async () => { await api(path + '/review', json('POST', Object.fromEntries(form))); refresh() })
    }}><label>Ý kiến duyệt<input name="note" required minLength={3} /></label>
      <label>Quyết định<select name="decision"><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Yêu cầu sửa</option></select></label>
      <button disabled={busy}>Lưu ý kiến</button></form>}
    {showAI && !doc.archived_at && <section className="subsection">
      <h3>Agent phân tích văn bản</h3>
      <p>{!aiEnabled ? 'Gemini chưa được cấu hình.' : !doc.has_file ? 'Đính kèm tệp có nội dung để phân tích.' : 'Kết quả dùng để tham khảo và cần được người phụ trách kiểm tra.'}</p>
      {canEdit && aiEnabled && doc.has_file && <><label className="check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
        Tôi xác nhận nội dung tệp và bối cảnh phòng ban được phép gửi tới Gemini.</label>
        <button disabled={!consent || busy} onClick={() => run(async () => {
          await api(path + '/analyses', json('POST', { approved_for_external_ai: true }))
          setAnalyses(await api<Analysis[]>(path + '/analyses'))
        })}>{busy ? 'Đang xử lý…' : 'Phân tích'}</button></>}
      {analyses.map(item => <section className="result" key={item.id}><small>{dateLabel(item.created_at)} · {item.provider}
        {!item.current_file && ' · Phiên bản tệp trước'}</small><p className="pre">{item.result}</p></section>)}
    </section>}
    {history.length > 0 && <section className="subsection"><h3>Lịch sử</h3>{history.map((item, index) =>
      <details key={index}><summary>{dateLabel(item.created_at)} · {item.actor} · {auditLabels[item.action] || item.action}</summary>
        {Object.keys(item.detail).length > 0 && <pre>{JSON.stringify(item.detail, null, 2)}</pre>}</details>)}</section>}
  </article>
}

const auditLabels: Record<string, string> = {
  DOCUMENT_CREATED: 'Thêm văn bản', DOCUMENT_UPDATED: 'Sửa văn bản', DOCUMENT_ARCHIVED: 'Đưa vào thùng rác',
  DOCUMENT_RESTORED: 'Khôi phục', SOURCE_FILE_UPLOADED: 'Đính kèm tệp', AI_ANALYSIS_CREATED: 'Phân tích AI',
  DOCUMENT_APPROVED: 'Đã duyệt', DOCUMENT_REJECTED: 'Yêu cầu sửa',
}
const nav: [Page, string][] = [['documents', 'Văn bản pháp luật'], ['drafts', 'Văn bản dự thảo'],
  ['analysis', 'AI phân tích'], ['tasks', 'Công việc và nhắc hạn'], ['overview', 'Tổng quan'], ['trash', 'Thùng rác']]

export function Workspace({ user, roleLabel, onLogout }: { user: User; roleLabel: string; onLogout: () => Promise<void> }) {
  const [page, setPage] = useState<Page>('documents')
  const [docs, setDocs] = useState<LegalDocument[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [selected, setSelected] = useState<string | null>(new URLSearchParams(location.search).get('document'))
  const [editor, setEditor] = useState<LegalDocument | 'new' | null>(null)
  const [batch, setBatch] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('')
  const [department, setDepartment] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [aiEnabled, setAiEnabled] = useState(false)
  const [revision, setRevision] = useState(0)
  const [pending, setPending] = useState(false)
  const refresh = () => setRevision(previous => previous + 1)
  const canReview = ['admin', 'legal'].includes(user.role)
  const canEdit = canReview || user.role === 'manager'
  const archived = page === 'trash'
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    Promise.all([api<LegalDocument[]>('/documents' + (archived ? '?archived=true' : '')),
      api<Department[]>('/departments'), api<{ enabled: boolean }>('/ai/config')]).then(([d, dep, ai]) => {
      if (!cancelled) { setDocs(d); setDepartments(dep); setAiEnabled(ai.enabled) }
    }).catch(error => { if (!cancelled) setError(error.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [archived, revision])
  const visible = docs.filter(doc => (page !== 'drafts' || doc.legal_status === 'DRAFT')
    && (!filter || doc.legal_status === filter) && (!department || doc.departments.includes(department))
    && [doc.title, doc.internal_code, doc.reference_number, doc.source_url].some(value => value?.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))))
  const doc = docs.find(item => item.id === selected)
  function navigate(next: Page) { setPage(next); setEditor(null); setBatch(false); setFilter(''); setDepartment(''); if (next === 'trash' || archived) setSelected(null) }
  const catalog = ['documents', 'drafts', 'analysis', 'trash'].includes(page)
  const title = page === 'admin' ? 'Phòng ban và người dùng' : nav.find(item => item[0] === page)?.[1]
  return <div className="layout">
    <aside className="sidebar"><div className="brand"><b>TC</b><span>TRAPHACO CNC<small>QUẢN LÝ TUÂN THỦ</small></span></div>
      <nav aria-label="Mục làm việc">{[...nav, ...(user.role === 'admin' ? [['admin', 'Phòng ban và người dùng'] as [Page, string]] : [])].map(([key, label]) =>
        <button key={key} className={page === key ? 'active' : ''} aria-current={page === key ? 'page' : undefined} onClick={() => navigate(key)}>{label}</button>)}</nav>
      <div className="profile"><strong>{user.display_name}</strong><small>{roleLabel}</small><button className="secondary" onClick={() => void onLogout().catch(() => undefined)}>Đăng xuất</button></div>
    </aside>
    <main className="content"><header className="page-header"><div><p className="eyebrow">TRAPHACO CNC / KHÔNG GIAN LÀM VIỆC</p><h1>{title}</h1></div>
      <button className="secondary" onClick={() => navigate('overview')}>Thông báo</button></header>
    {catalog && !archived && <section className="agents" aria-label="Agent hỗ trợ">
      <button onClick={() => navigate('analysis')}><strong>Phân tích văn bản</strong><small>{aiEnabled ? 'Gemini · Chọn văn bản có tệp' : 'Gemini chưa cấu hình'}</small></button>
      {['Theo dõi nguồn', 'So sánh và góp ý', 'Hỏi đáp kho văn bản'].map(label => <div key={label}><strong>{label}</strong><small>Chưa triển khai</small></div>)}
    </section>}
    {error && <p className="error" role="alert">{error} <button className="secondary" onClick={refresh}>Thử lại</button></p>}
    {catalog && <>
      <section className="panel"><div className="section-title"><h2>{archived ? 'Văn bản đã lưu trữ' : 'Danh mục văn bản'}</h2>
        {canEdit && !archived && <div className="actions"><button className="secondary" onClick={() => { setBatch(!batch); setEditor(null) }}>Nhập nhiều link</button>
          <button onClick={() => { setEditor('new'); setBatch(false) }}>+ Thêm văn bản</button></div>}</div>
        <div className="filters"><input aria-label="Tìm kiếm" placeholder="Tìm tên, số hiệu hoặc đường link…" value={query} onChange={e => setQuery(e.target.value)} />
          <select aria-label="Trạng thái" value={filter} onChange={e => setFilter(e.target.value)}><option value="">Mọi trạng thái</option>
            {Object.entries(statuses).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select>
          <select aria-label="Phòng ban" value={department} onChange={e => setDepartment(e.target.value)}><option value="">Mọi phòng ban</option>
            {departments.map(item => <option key={item.id}>{item.name}</option>)}</select></div>
        {loading ? <p role="status">Đang tải danh mục…</p> : visible.length === 0 ? <p>Chưa có văn bản phù hợp.</p> :
          <div className="table-wrap"><table><thead><tr><th>Văn bản</th><th>Trạng thái</th><th>Hiệu lực</th><th>Tài liệu</th></tr></thead>
            <tbody>{visible.map(row => <tr key={row.id} className={selected === row.id ? 'selected' : ''}><td>
              <button className="text-button" onClick={() => { setSelected(row.id); setEditor(null) }}>{row.title}</button>
              <small>{row.reference_number || row.internal_code}</small></td><td><span className="badge">{statuses[row.legal_status]}</span></td>
              <td>{dateLabel(row.effective_on)}</td><td>{row.has_file ? 'Có tệp' : row.source_url ? 'Đường link' : '—'}</td></tr>)}</tbody></table></div>}
      </section>
      {batch && <Batch onSaved={refresh} />}
      {editor && <Editor key={editor === 'new' ? 'new' : editor.id} doc={editor === 'new' ? null : editor}
        departments={departments} canReview={canReview} onClose={() => setEditor(null)}
        onSave={saved => { setEditor(null); setSelected(saved.id); refresh() }} />}
      {doc && !editor && <><div className="actions">
        {canEdit && !archived && <button className="secondary" onClick={() => setEditor(doc)}>Sửa văn bản</button>}
        {canEdit && <button className="secondary" disabled={pending} onClick={async () => {
          if (!archived && !confirm('Đưa văn bản này vào thùng rác?')) return
          setPending(true)
          try { await api('/documents/' + doc.id + (archived ? '/restore' : '/archive'), { method: 'POST' }); setSelected(null); refresh() }
          catch (error) { setError((error as Error).message) } finally { setPending(false) }
        }}>{archived ? 'Khôi phục' : 'Đưa vào thùng rác'}</button>}
        <button className="secondary" onClick={() => setSelected(null)}>Đóng chi tiết</button>
      </div><Detail key={doc.id} doc={doc} canEdit={canEdit} canReview={canReview} aiEnabled={aiEnabled} showAI={page === 'analysis'} refresh={refresh} /></>}
    </>}
    {page === 'tasks' && <TaskList canAssign={canReview} docs={docs} />}
    {page === 'admin' && <Administration departments={departments} refresh={refresh} />}
    {page === 'overview' && <Overview />}
    </main>
  </div>
}

function Overview() {
  const [data, setData] = useState<{ totals: Record<string, number>; alerts: { id: string; message: string }[] }>()
  const [error, setError] = useState('')
  useEffect(() => { api<NonNullable<typeof data>>('/dashboard').then(setData).catch(error => setError(error.message)) }, [])
  const labels = { total_documents: 'Tổng văn bản', new_documents: 'Văn bản mới trong 7 ngày',
    pending_drafts: 'Dự thảo chờ duyệt', effective_soon: 'Sắp có hiệu lực', overdue: 'Công việc quá hạn' }
  if (error) return <p className="error">{error}</p>
  if (!data) return <p>Đang tải tổng quan…</p>
  return <><div className="stats">{Object.entries(labels).map(([key, label]) => <article className="panel" key={key}>
    <strong>{data.totals[key]}</strong><span>{label}</span></article>)}</div>
    <section className="panel"><h2>Thông báo</h2>{data.alerts.length ? data.alerts.map(item => <p key={item.id}>{item.message}</p>) : <p>Chưa có thông báo.</p>}</section></>
}
