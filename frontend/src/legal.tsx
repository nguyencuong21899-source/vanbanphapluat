import { useEffect, useState } from 'react'
import { api, dateLabel, json, type Department, type LegalDocument, type User } from './api'
import { MatterDetail } from './legal-detail'
import { Actions, labels, MatterForm, modes, todayVN, type Action, type Knowledge, type LegalSection,
  type LibrarySource, type Matter, type Person, type Kind } from './legal-shared'
export type { LegalSection } from './legal-shared'

export function LegalWorkbench({ section, user, departments, documents, aiEnabled, onSection, openDocuments }: {
  section: LegalSection; user: User; departments: Department[]; documents: LegalDocument[]; aiEnabled: boolean;
  onSection: (section: LegalSection) => void; openDocuments: () => void;
}) {
  const [matters, setMatters] = useState<Matter[]>([]), [library, setLibrary] = useState<LibrarySource[]>([])
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]), [actions, setActions] = useState<Action[]>([])
  const [people, setPeople] = useState<Person[]>([]), [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<Kind | ''>(''), [query, setQuery] = useState(''), [creating, setCreating] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0)
  const refresh = () => setRevision(x => x + 1)
  useEffect(() => { setSelected(null); setQuery('') }, [section])
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    Promise.all([api<Matter[]>('/legal/matters'), api<LibrarySource[]>('/legal/library'), api<Knowledge[]>('/legal/knowledge'),
      api<Action[]>('/legal/actions'), api<Person[]>('/legal/people')]).then(([m, l, k, a, p]) => {
      if (!cancelled) { setMatters(m); setLibrary(l); setKnowledge(k); setActions(a); setPeople(p) }
    }).catch(e => { if (!cancelled) setError(e.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [revision])
  async function run(action: () => Promise<void>, message = 'Đã lưu thay đổi.') {
    setBusy(true); setError(''); setNotice('')
    try { await action(); setNotice(message); refresh() } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  function open(id: string) { setSelected(id); setCreating(false) }
  const search = (value: string) => value.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))
  const overdue = actions.filter(a => a.status !== 'DONE' && a.due_on < todayVN())
  return <>
    {error && <p className="error" role="alert">{error} <button className="secondary" onClick={refresh}>Tải lại</button></p>}
    {notice && <p className="success" role="status">{notice}</p>}
    {selected ? <><button className="secondary" onClick={() => { setSelected(null); setNotice('') }}>← Danh sách</button>
      <MatterDetail key={selected} id={selected} revision={revision} user={user} departments={departments} documents={documents}
        aiEnabled={aiEnabled} library={library} people={people} actions={actions} busy={busy} run={run} open={open} /></> : <>
    {section === 'workbench' && <>
      <section className="legal-hero"><div><p className="eyebrow">PHÁP LÝ & TUÂN THỦ DOANH NGHIỆP</p>
        <h2>Từ căn cứ pháp lý đến hành động</h2><p>Chọn Agent, tập hợp hồ sơ, rà soát kết quả và giao việc cho người phụ trách.</p></div>
        <button onClick={() => { setCreating(true); setMode('CASE') }}>+ Mở hồ sơ mới</button></section>
      <div className="legal-metrics">
        <button onClick={() => { setMode(''); setCreating(false) }}><strong>{matters.length}</strong><span>Hồ sơ trong phạm vi truy cập</span></button>
        <button onClick={() => onSection('obligations')}><strong>{overdue.length}</strong><span>Nghĩa vụ quá hạn nội bộ</span></button>
        <button onClick={() => onSection('knowledge')}><strong>{knowledge.length}</strong><span>Kết quả đã duyệt để tái sử dụng</span></button>
      </div>
      <section className="legal-agents" aria-label="Các Agent pháp lý">{modes.map((item, i) =>
        <button className={mode === item.key ? 'chosen' : ''} key={item.key} onClick={() => { setMode(item.key); setCreating(true) }}>
          <span className="agent-number">0{i + 1}</span><strong>{item.title}</strong><small>{item.description}</small>
        </button>)}
        <button onClick={() => onSection('obligations')}><span className="agent-number">07</span><strong>Nghĩa vụ và bằng chứng</strong><small>Phân công → nộp bằng chứng → phê duyệt</small></button>
      </section>
      <p className="muted">Agent đọc các nguồn anh/chị cung cấp. {aiEnabled ? 'Gemini đã cấu hình.' : 'Chưa cấu hình Gemini: vẫn có thể lập hồ sơ, viết báo cáo và giao việc.'}</p>
      <div className="actions"><button className="secondary" onClick={openDocuments}>Danh mục VBPL và nhắc mốc pháp lý</button>
        <button className="secondary" onClick={() => onSection('library')}>Kho tài liệu nội bộ</button></div>
      {creating && <MatterForm key={mode || 'CASE'} kind={mode || 'CASE'} user={user} departments={departments} busy={busy}
        onCancel={() => setCreating(false)} onSave={data => run(async () => {
          const result = await api<Matter>('/legal/matters', json('POST', data)); open(result.id)
        }, 'Đã tạo hồ sơ. Thêm tài liệu nguồn để bắt đầu.')} />}
    </>}
    <section className="panel legal-list">
      <div className="section-title"><h2>{{ workbench: 'Hồ sơ đang làm việc', library: 'Kho tài liệu theo quyền truy cập',
        knowledge: 'Tri thức đã duyệt', obligations: 'Nghĩa vụ và kế hoạch hành động' }[section]}</h2>
        {section === 'workbench' && <select aria-label="Lọc loại hồ sơ" value={mode} onChange={e => setMode(e.target.value as Kind | '')}>
          <option value="">Mọi loại hồ sơ</option>{modes.map(m => <option key={m.key} value={m.key}>{m.title}</option>)}</select>}</div>
      <label>Tìm kiếm<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tên hồ sơ, nguồn hoặc công việc…" /></label>
      {loading ? <p role="status">Đang tải không gian pháp lý…</p> : <>
        {section === 'workbench' && <><div className="matter-grid">{matters.filter(m => (!mode || mode === m.kind) && search(m.title)).map(m =>
          <button key={m.id} className="matter-card" onClick={() => open(m.id)}><small>{modes.find(x => x.key === m.kind)?.title}</small>
            <strong>{m.title}</strong><span className="badge">{labels[m.status]}</span><small>{m.source_count} nguồn · {m.owner}</small>
            <small>{labels[m.visibility]}</small></button>)}</div>
          {!matters.some(m => (!mode || mode === m.kind) && search(m.title)) && <p>Chưa có hồ sơ phù hợp. Chọn một Agent để mở hồ sơ đầu tiên.</p>}</>}
        {section === 'library' && <><p className="muted">Tài liệu được lưu theo hồ sơ và phạm vi truy cập. Mở hồ sơ để thêm tệp; nguồn được giữ nguyên cho từng phiên bản báo cáo.</p>
          {library.filter(s => search(s.title + s.matter_title)).map(s => <article className="library-row" key={s.id}>
            <div><strong>{s.title}</strong><small>{labels[s.kind]} · {labels[s.visibility]} · {s.matter_title}</small></div>
            <button className="secondary" onClick={() => open(s.matter_id)}>Mở hồ sơ</button></article>)}
          {!library.filter(s => search(s.title + s.matter_title)).length && <p>Chưa có tài liệu phù hợp.</p>}
          <button onClick={() => { onSection('workbench'); setMode('KNOWLEDGE'); setCreating(true) }}>+ Tạo hồ sơ để thêm tài liệu</button></>}
        {section === 'knowledge' && <><p className="muted">Chỉ hiển thị kết quả mới nhất đã duyệt, còn khớp phiên bản nguồn và trong phạm vi anh/chị được xem.</p>
          {knowledge.filter(k => search(k.title + k.result.summary)).map(k => <article className="result" key={k.id}><h3>{k.title}</h3>
            <small>{k.reviewer} duyệt · {dateLabel(k.reviewed_at)} · {labels[k.visibility]}</small><p className="pre">{k.result.summary}</p>
            <button className="secondary" onClick={() => open(k.matter_id)}>Xem căn cứ và kết quả</button></article>)}
          {!knowledge.filter(k => search(k.title + k.result.summary)).length && <p>Chưa có tri thức đã duyệt phù hợp.</p>}</>}
        {section === 'obligations' && <><p className="muted">Hạn dưới đây là hạn nội bộ. Hoàn thành cần bằng chứng và Pháp chế xác nhận.</p>
          <Actions items={actions.filter(a => search(a.title + a.matter_title))} user={user} busy={busy} open={open} run={run} /></>}
      </>}
    </section></>}
  </>
}
