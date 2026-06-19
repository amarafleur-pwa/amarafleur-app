// All date helpers use Asia/Manila timezone explicitly to avoid UTC offset bugs
// (toISOString() returns UTC, which is 8h behind PH — wrong from midnight to 7:59 AM)

export const todayPH = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

export const toDateStrPH = (d: Date): string =>
  d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

export const daysFromNowPH = (n: number): string => {
  const [y, m, d] = todayPH().split('-').map(Number)
  const date = new Date(y, m - 1, d + n)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
