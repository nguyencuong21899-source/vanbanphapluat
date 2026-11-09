import { useEffect, useState, type FormEvent } from 'react'
import { api, dateLabel, json, roles, taskStatuses, type Department, type LegalDocument, type User } from './api'

type Task = { id: string; requirement: string; title: string; assignee: string | null; department: string | null; internal_deadline: string | null; status: string }
type Reminder = { task_id: string; due_on: string; days_before: number; state: string; requirement: string; updated_at: string }

export function TaskList({ canAssign, docs }: { canAssign: boolean; docs: LegalDocument[] }) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function refresh() { return api<Task[]>('/tasks').then(setTasks) }
  useEffect(() => {
    refresh().catch(error => setError(error.message))
    if (canAssign) {
      api<User[]>('/accounts').then(setUsers).catch(error => setError(error.message))
      api<Reminder[]>('/reminders').then(setReminders).catch(error => setError(error.message))
    }
  }, [canAssign])
  async function run(action: () => Promise<void>) {
    setError(''); setBusy(true)
    try { await action(); await refresh() }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return <>
    {error && <p className="error" role="alert">{error}</p>}
    {canAssign && <form className="panel" onSubmit={event => {
      event.preventDefault()
      const form = event.currentTarget
      const payload = Object.fromEntries(new FormData(form))
      void run(async () => { await api('/tasks', json('POST', payload)); form.reset() })
    }}>
      <h2>Giao công việc</h2><div className="form-grid">
        <label>Văn bản<select name="document_id" required><option value="">Chọn văn bản</option>
          {docs.map(doc => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select></label>
        <label>Người xử lý<select name="assignee_id" required><option value="">Chọn tài khoản</option>
          {users.map(user => <option key={user.id} value={user.id}>{user.display_name} ({user.username})</option>)}</select></label>
        <label>Hạn nội bộ<input type="date" name="internal_deadline" required /></label>
        <label>Yêu cầu<input name="requirement" minLength={3} maxLength={3000} required /></label>
      </div><button disabled={busy}>Giao việc</button>
    </form>}
    <section className="panel"><h2>Danh sách công việc</h2>
      {!tasks ? <p>{error ? 'Không tải được công việc.' : 'Đang tải…'}</p> : !tasks.length ? <p>Chưa có công việc.</p> :
        <div className="table-wrap"><table><thead><tr><th>Công việc</th><th>Người xử lý</th><th>Hạn nội bộ</th><th>Trạng thái</th></tr></thead>
          <tbody>{tasks.map(task => <tr key={task.id}><td>{task.requirement}<small>{task.title}</small></td>
            <td>{task.assignee || '—'}<small>{task.department}</small></td><td>{dateLabel(task.internal_deadline)}</td>
            <td><select aria-label={'Trạng thái ' + task.requirement} value={task.status} disabled={busy} onChange={event => {
              const status = event.target.value
              void run(async () => { await api('/tasks/' + task.id, json('PATCH', { status })) })
            }}>{Object.entries(taskStatuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></td></tr>)}</tbody></table></div>}
    </section>
    {canAssign && <section className="panel"><h2>Lịch sử email nhắc hạn</h2>{reminders.length ? reminders.map(item =>
      <p key={item.task_id + item.due_on + item.days_before}>{item.requirement} · {dateLabel(item.updated_at)} · {
        { SENT: 'Đã gửi', FAILED: 'Gửi thất bại', SENDING: 'Đang gửi hoặc cần đối chiếu' }[item.state]}</p>) : <p>Chưa có lịch sử gửi.</p>}</section>}
  </>
}

export function Administration({ departments, refresh }: { departments: Department[]; refresh: () => void }) {
  const [users, setUsers] = useState<User[]>([])
  const [editing, setEditing] = useState<Department | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const load = () => api<User[]>('/accounts').then(setUsers)
  useEffect(() => { load().catch(error => setError(error.message)) }, [])

  async function save(event: FormEvent<HTMLFormElement>, path: string, method: string) {
    event.preventDefault()
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    setError(''); setMessage(''); setBusy(true)
    try {
      await api(path, json(method, { ...data, department_id: data.department_id || null, email: data.email || null }))
      form.reset()
      if (path === '/accounts') await load()
      else { setEditing(null); refresh() }
      setMessage('Đã lưu.')
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return <>
    {error && <p className="error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <section className="panel"><h2>Phòng ban</h2><div className="actions">{departments.map(dep =>
      <button key={dep.id} className="secondary" onClick={() => setEditing(dep)}>{dep.name}</button>)}</div>
      <form key={editing?.id || 'new'} onSubmit={event => void save(event, '/departments' + (editing ? '/' + editing.id : ''), editing ? 'PUT' : 'POST')}>
        <div className="form-grid"><label>Tên phòng ban<input name="name" defaultValue={editing?.name} required maxLength={160} /></label>
          <label>Từ khóa<input name="keywords" defaultValue={editing?.keywords} maxLength={2000} /></label></div>
        <label>Chức năng và nhiệm vụ<textarea name="description" defaultValue={editing?.description} maxLength={5000} /></label>
        <div className="actions"><button disabled={busy}>{editing ? 'Lưu thay đổi' : 'Thêm phòng ban'}</button>
          {editing && <button type="button" className="secondary" onClick={() => setEditing(null)}>Hủy sửa</button>}</div>
      </form>
    </section>
    <section className="panel"><h2>Tài khoản nội bộ</h2>
      <form onSubmit={event => void save(event, '/accounts', 'POST')}>
        <div className="form-grid"><label>Họ tên<input name="display_name" required /></label>
          <label>Tên đăng nhập<input name="username" required minLength={3} autoComplete="off" /></label>
          <label>Mật khẩu<input name="password" type="password" required minLength={12} autoComplete="new-password" /></label>
          <label>Email nhận nhắc hạn<input type="email" name="email" /></label>
          <label>Phòng ban<select name="department_id"><option value="">Chưa chọn</option>
            {departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}</select></label>
          <label>Vai trò<select name="role" defaultValue="employee">{Object.entries(roles).map(([key, label]) =>
            <option key={key} value={key}>{label}</option>)}</select></label></div>
        <button disabled={busy}>Tạo tài khoản</button>
      </form>
      {users.map(user => <p key={user.id}>{user.display_name} ({user.username}) · {roles[user.role]}</p>)}
    </section>
  </>
}
