import { db } from '../../db/db'
import type { BusinessExpense } from '../../db/db'
import { dbWrite } from '../../lib/dbGateway'
import { logBusinessExpense } from '../../lib/sheets'
import { toDateStrPH } from '../../lib/dateUtils'

// When a monthly bill is marked paid, auto-create next month's entry —
// shared by the list view's quick-toggle and the edit form's toggle so
// both stay in sync (including the Sheets log call).
export async function createNextRecurringExpense(expense: BusinessExpense) {
  const next = new Date(expense.dueDate + 'T00:00:00')
  next.setMonth(next.getMonth() + 1)
  const newData = {
    name: expense.name, amount: expense.amount,
    dueDate: toDateStrPH(next),
    category: expense.category, notes: expense.notes,
    isRecurring: true, isPaid: false, modeOfPayment: expense.modeOfPayment,
    expenseType: 'monthly' as const,
  }
  const { data: row } = await dbWrite<{ id: string }>('business_expenses', 'insert', {
    payload: {
      name: newData.name, amount: newData.amount, due_date: newData.dueDate,
      category: newData.category, notes: newData.notes ?? null,
      is_paid: false, is_recurring: true, mode_of_payment: newData.modeOfPayment ?? null,
      expense_type: 'monthly',
    },
    select: true, single: true,
  })
  await db.businessExpenses.add({ ...newData, supabaseId: row?.id })
  if (row?.id) logBusinessExpense(newData, row.id)
}
