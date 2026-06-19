// Fire-and-forget: never awaited, never throws, never blocks the UI.
// Sheet tab names must match exactly in the Google Spreadsheet.

const now = () => new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })

const API_HEADERS = {
  'Content-Type': 'application/json',
  'x-app-secret': import.meta.env.VITE_SHEETS_API_SECRET ?? '',
}

async function appendRow(sheet: string, row: (string | number)[]) {
  try {
    await fetch('/api/sheets-log', {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify({ sheet, row }),
    })
  } catch {
    // Silently ignore — sheets logging is best-effort
  }
}

async function updateRow(sheet: string, row: (string | number)[], appId: string) {
  try {
    await fetch('/api/sheets-update', {
      method: 'POST',
      headers: API_HEADERS,
      body: JSON.stringify({ sheet, row, appId }),
    })
  } catch {
    // Silently ignore — sheets logging is best-effort
  }
}

export function deleteSheetRow(sheet: string, appId: string) {
  void fetch('/api/sheets-delete', {
    method: 'POST',
    headers: API_HEADERS,
    body: JSON.stringify({ sheet, appId }),
  }).catch(() => {})
}

export function logPersonalExpense(e: {
  name: string; amount: number; amountPaid?: number; dueDate: string; category?: string;
  modeOfPayment?: string; isRecurring: boolean; notes?: string; loggedBy?: string
}, appId: string) {
  void appendRow('Personal Expenses', [
    e.name, e.amount, e.amountPaid ?? 0, e.dueDate, e.category ?? '', e.modeOfPayment ?? '',
    e.isRecurring ? 'Yes' : 'No', e.notes ?? '', e.loggedBy ?? '', now(), appId,
  ])
}

export function logBusinessExpense(e: {
  name: string; amount: number; amountPaid?: number; dueDate: string; category: string;
  modeOfPayment?: string; isRecurring?: boolean; notes?: string; loggedBy?: string
}, appId: string) {
  void appendRow('Business Expenses', [
    e.name, e.amount, e.amountPaid ?? 0, e.dueDate, e.category, e.modeOfPayment ?? '',
    e.isRecurring ? 'Yes' : 'No', e.notes ?? '', e.loggedBy ?? '', now(), appId,
  ])
}

export function logOrder(o: {
  customerName: string; description: string; quantity?: number;
  dueDate: string; totalAmount: number; depositPaid: number;
  modeOfPayment?: string; notes?: string; fulfillmentType?: 'delivery' | 'pickup'; loggedBy?: string
}, appId: string) {
  void appendRow('Orders', [
    o.customerName, o.description, o.quantity ?? 1,
    o.dueDate, o.totalAmount, o.depositPaid,
    o.modeOfPayment ?? '', o.notes ?? '', o.fulfillmentType ?? '', o.loggedBy ?? '', now(), appId,
  ])
}

export function logAdvanceOrder(o: {
  customerName: string; description: string; quantity?: number;
  dueDate: string; totalAmount: number; depositPaid: number;
  modeOfPayment?: string; notes?: string; fulfillmentType?: 'delivery' | 'pickup'; loggedBy?: string
}, appId: string) {
  void appendRow('Advance Orders', [
    o.customerName, o.description, o.quantity ?? 1,
    o.dueDate, o.totalAmount, o.depositPaid,
    o.modeOfPayment ?? '', o.notes ?? '', o.fulfillmentType ?? '', o.loggedBy ?? '', now(), appId,
  ])
}

export function logPayment(p: {
  customerName: string; orderDesc: string; amount: number;
  type: string; paidAt: string; notes?: string; loggedBy?: string
}, appId: string) {
  void appendRow('Payments', [
    p.customerName, p.orderDesc, p.amount,
    p.type, p.paidAt, p.notes ?? '', p.loggedBy ?? '', now(), appId,
  ])
}

export async function exportPaymentsToSheet(rows: {
  customerName: string; orderDesc: string; amount: number;
  type: string; paidAt: string; notes?: string; loggedBy?: string; appId: string
}[]) {
  for (const p of rows) {
    await appendRow('Payments', [
      p.customerName, p.orderDesc, p.amount,
      p.type, p.paidAt, p.notes ?? '', p.loggedBy ?? '', now(), p.appId,
    ])
  }
}

export function logCustomer(c: {
  name: string; phone?: string; notes?: string; loggedBy?: string
}, appId: string) {
  void appendRow('Customers', [
    c.name, c.phone ?? '', c.notes ?? '', c.loggedBy ?? '', now(), appId,
  ])
}

export function updatePersonalExpense(e: {
  name: string; amount: number; amountPaid?: number; dueDate: string; category?: string;
  modeOfPayment?: string; isRecurring: boolean; notes?: string; loggedBy?: string
}, appId: string) {
  void updateRow('Personal Expenses', [
    e.name, e.amount, e.amountPaid ?? 0, e.dueDate, e.category ?? '', e.modeOfPayment ?? '',
    e.isRecurring ? 'Yes' : 'No', e.notes ?? '', e.loggedBy ?? '', now(), appId,
  ], appId)
}

export function updateBusinessExpense(e: {
  name: string; amount: number; amountPaid?: number; dueDate: string; category: string;
  modeOfPayment?: string; isRecurring?: boolean; notes?: string; loggedBy?: string
}, appId: string) {
  void updateRow('Business Expenses', [
    e.name, e.amount, e.amountPaid ?? 0, e.dueDate, e.category, e.modeOfPayment ?? '',
    e.isRecurring ? 'Yes' : 'No', e.notes ?? '', e.loggedBy ?? '', now(), appId,
  ], appId)
}

export function updateOrder(o: {
  customerName: string; description: string; quantity?: number;
  dueDate: string; totalAmount: number; depositPaid: number;
  modeOfPayment?: string; notes?: string; fulfillmentType?: 'delivery' | 'pickup'; loggedBy?: string
}, appId: string) {
  void updateRow('Orders', [
    o.customerName, o.description, o.quantity ?? 1,
    o.dueDate, o.totalAmount, o.depositPaid,
    o.modeOfPayment ?? '', o.notes ?? '', o.fulfillmentType ?? '', o.loggedBy ?? '', now(), appId,
  ], appId)
}

export function updateAdvanceOrder(o: {
  customerName: string; description: string; quantity?: number;
  dueDate: string; totalAmount: number; depositPaid: number;
  modeOfPayment?: string; notes?: string; fulfillmentType?: 'delivery' | 'pickup'; loggedBy?: string
}, appId: string) {
  void updateRow('Advance Orders', [
    o.customerName, o.description, o.quantity ?? 1,
    o.dueDate, o.totalAmount, o.depositPaid,
    o.modeOfPayment ?? '', o.notes ?? '', o.fulfillmentType ?? '', o.loggedBy ?? '', now(), appId,
  ], appId)
}
