import { supabase } from './supabase'
import { db } from '../db/db'

export async function restoreFromSupabase(): Promise<void> {
  const [pe, be, ord, pay, cust] = await Promise.all([
    supabase.from('personal_expenses').select('*'),
    supabase.from('business_expenses').select('*'),
    supabase.from('orders').select('*'),
    supabase.from('payments').select('*'),
    supabase.from('customers').select('*'),
  ])

  if (pe.error || be.error || ord.error || pay.error || cust.error) {
    throw new Error('Supabase fetch failed')
  }

  await db.transaction('rw', [
    db.personalExpenses, db.businessExpenses,
    db.orders, db.payments, db.customers,
  ], async () => {
    await Promise.all([
      db.personalExpenses.clear(),
      db.businessExpenses.clear(),
      db.orders.clear(),
      db.payments.clear(),
      db.customers.clear(),
    ])

    await db.personalExpenses.bulkAdd(
      (pe.data ?? []).map(r => ({
        supabaseId: r.id, name: r.name, amount: r.amount, dueDate: r.due_date,
        category: r.category, isPaid: r.is_paid, isRecurring: r.is_recurring, notes: r.notes,
      }))
    )

    await db.businessExpenses.bulkAdd(
      (be.data ?? []).map(r => ({
        supabaseId: r.id, name: r.name, amount: r.amount, dueDate: r.due_date,
        modeOfPayment: r.mode_of_payment, isPaid: r.is_paid, category: r.category, notes: r.notes,
      }))
    )

    // Insert orders one-by-one to capture generated local IDs for payment FK mapping
    const supabaseToLocalOrderId = new Map<string, number>()
    for (const r of (ord.data ?? [])) {
      const localId = await db.orders.add({
        supabaseId: r.id, customerName: r.customer_name, description: r.description,
        quantity: r.quantity, time: r.time, orderDate: r.order_date, dueDate: r.due_date,
        totalAmount: r.total_amount, depositPaid: r.deposit_paid, isDone: r.is_done, notes: r.notes,
      })
      supabaseToLocalOrderId.set(r.id, localId as number)
    }

    await db.payments.bulkAdd(
      (pay.data ?? []).map(r => ({
        supabaseId: r.id,
        orderId: supabaseToLocalOrderId.get(r.order_id) ?? 0,
        amount: r.amount, paidAt: r.paid_at,
        type: r.type as 'deposit' | 'balance' | 'full',
        notes: r.notes,
      }))
    )

    await db.customers.bulkAdd(
      (cust.data ?? []).map(r => ({
        supabaseId: r.id, name: r.name, phone: r.phone, notes: r.notes,
      }))
    )
  })
}
