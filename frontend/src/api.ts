export async function api<T>(path: string, options: RequestInit = {}, token = sessionStorage.getItem('session')): Promise<T> {
  const headers = new Headers(options.headers)
  if (token) headers.set('Authorization', 'Bearer ' + token)
  const response = await fetch('/api' + path, { ...options, headers })
  if (!response.ok) {
    if (response.status === 401 && token && token === sessionStorage.getItem('session')) {
      sessionStorage.removeItem('session')
      window.dispatchEvent(new Event('session-expired'))
    }
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || 'Không thể thực hiện yêu cầu (' + response.status + ')')
  }
  if (response.status === 204) return undefined as T
  if (!response.headers.get('content-type')?.includes('application/json')) return await response.blob() as T
  return response.json()
}

export function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export const statuses: Record<string, string> = {
  UNVERIFIED: 'Chưa xác minh', DRAFT: 'Dự thảo', PENDING_EFFECT: 'Chưa có hiệu lực',
  ACTIVE: 'Còn hiệu lực', PARTIALLY_REPEALED: 'Hết hiệu lực một phần',
  REPEALED: 'Hết hiệu lực toàn bộ', SUSPENDED: 'Tạm ngưng',
}

export const roles: Record<string, string> = {
  admin: 'Quản trị viên', legal: 'Pháp chế / Tuân thủ', manager: 'Quản lý phòng ban', employee: 'Nhân viên',
}

export const taskStatuses: Record<string, string> = {
  OPEN: 'Chưa làm', IN_PROGRESS: 'Đang làm', DONE: 'Hoàn thành',
}

export type User = { id: string; username: string; display_name: string; role: string; department_id: string | null }
export type Department = { id: string; name: string; description: string; keywords: string }
export type LegalDocument = {
  id: string; internal_code: string; title: string; document_type: string; reference_number: string | null;
  issuing_authority: string | null; source_url: string | null; notes: string | null; legal_status: string;
  issued_on: string | null; effective_on: string | null; expires_on: string | null; comment_deadline: string | null;
  primary_domain: string | null; departments: string[]; applicability: string; has_file: boolean;
  source_filename: string | null; updated_at: string; archived_at: string | null; review_state: string;
}

export const dateLabel = (value: string | null) =>
  value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value.length === 10 ? value + 'T00:00:00' : value)) : '—'

export const sourceLink = (value: string | null) => {
  try { const url = new URL(value || ''); return ['http:', 'https:'].includes(url.protocol) ? url.href : null }
  catch { return null }
}
