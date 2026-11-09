import { StrictMode, useEffect, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { api, json, roles, type User } from './api'
import { Workspace } from './workspace'
import './style.css'

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [setup, setSetup] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api<{ required: boolean }>('/auth/setup', {}, null).then(result => setSetup(result.required))
      .catch(error => setError(error.message))
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const credentials = { username: form.get('username'), password: form.get('password') }
    setError('')
    setBusy(true)
    try {
      if (setup) {
        await api('/auth/setup', json('POST', { ...credentials, display_name: form.get('display_name') }), String(form.get('token')))
        setSetup(false)
      }
      const session = await api<{ token: string }>('/auth/login', json('POST', credentials), null)
      sessionStorage.setItem('session', session.token)
      onLogin(await api<User>('/auth/me'))
    } catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }

  return <main className="login">
    <div className="brand"><b>TC</b><span>TRAPHACO CNC<small>AI LEGAL MONITORING SYSTEM</small></span></div>
    <p className="eyebrow">KHÔNG GIAN NỘI BỘ</p>
    <h1>{setup ? 'Thiết lập quản trị viên' : 'Đăng nhập'}</h1>
    <p className="muted">Hệ thống AI giám sát văn bản pháp luật và quản lý tuân thủ</p>
    {error && <p className="error" role="alert">{error}</p>}
    {setup === null ? <p>{error ? 'Tải lại trang để thử kết nối.' : 'Đang kết nối hệ thống…'}</p> :
      <form onSubmit={submit}>
        {setup && <><label>Mã thiết lập<input name="token" type="password" required /></label>
          <label>Họ tên<input name="display_name" required maxLength={160} /></label></>}
        <label>Tên đăng nhập<input name="username" required minLength={3} autoComplete="username" /></label>
        <label>Mật khẩu<input name="password" type="password" required minLength={12}
          autoComplete={setup ? 'new-password' : 'current-password'} /></label>
        <button disabled={busy}>{busy ? 'Đang xử lý…' : setup ? 'Tạo tài khoản và đăng nhập' : 'Đăng nhập'}</button>
      </form>}
  </main>
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(sessionStorage.getItem('session')))
  useEffect(() => {
    const reset = () => setUser(null)
    window.addEventListener('session-expired', reset)
    if (sessionStorage.getItem('session')) {
      api<User>('/auth/me').then(setUser).catch(reset).finally(() => setLoading(false))
    }
    return () => window.removeEventListener('session-expired', reset)
  }, [])
  if (loading) return <main className="login">Đang tải phiên làm việc…</main>
  if (!user) return <Login onLogin={setUser} />
  return <Workspace user={user} roleLabel={roles[user.role]} onLogout={async () => {
    try { await api('/auth/logout', { method: 'POST' }) }
    finally { sessionStorage.removeItem('session'); setUser(null) }
  }} />
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
