const KEY = 'af-current-user'

export function getCurrentUser(): string {
  return localStorage.getItem(KEY) ?? ''
}

export function setCurrentUser(name: string) {
  localStorage.setItem(KEY, name)
}
