const KEY = 'af-setup-secret'

export function getSetupSecret(): string {
  return localStorage.getItem(KEY) ?? ''
}

export function setSetupSecret(secret: string) {
  localStorage.setItem(KEY, secret)
}

export function clearSetupSecret() {
  localStorage.removeItem(KEY)
}
