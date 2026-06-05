import { supabase } from './supabase'
import { db } from '../db/db'
import { logPersonalExpense, logBusinessExpense, logOrder, logPayment } from './sheets'

export async function syncPendingItems(): Promise<void> {
  if (!navigator.onLine) return

  // Personal expenses
  const pendingPE = await db.personalExpenses.filter(e => !!e.pendingSync).toArray()
  for (const e of pendingPE) {
    const payload = {
      name: e.name, amount: e.amount, due_date: e.dueDate,
      category: e.category ?? null, is_paid: e.isPaid,
      is_recurring: e.isRecurring, notes: e.notes ?? null,
      expense_type: e.expenseType ?? null, receipt_url: e.receiptUrl ?? null,
      amount_paid: e.amountPaid ?? null,
    }
    if (!e.supabaseId) {
      const { data: row, error } = await supabase.from('personal_expenses').insert(payload).select().single()
      if (!error) {
        await db.personalExpenses.update(e.id!, { supabaseId: row.id, pendingSync: false })
        logPersonalExpense(e, row.id)
      }
    } else {
      const { error } = await supabase.from('personal_expenses').update(payload).eq('id', e.supabaseId)
      if (!error) await db.personalExpenses.update(e.id!, { pendingSync: false })
    }
  }

  // Business expenses
  const pendingBE = await db.businessExpenses.filter(e => !!e.pendingSync).toArray()
  for (const e of pendingBE) {
    const payload = {
      name: e.name, amount: e.amount, due_date: e.dueDate,
      mode_of_payment: e.modeOfPayment ?? null, is_paid: e.isPaid,
      is_recurring: e.isRecurring ?? false, category: e.category, notes: e.notes ?? null,
      expense_type: e.expenseType ?? null, receipt_url: e.receiptUrl ?? null,
      amount_paid: e.amountPaid ?? null,
    }
    if (!e.supabaseId) {
      const { data: row, error } = await supabase.from('business_expenses').insert(payload).select().single()
      if (!error) {
        await db.businessExpenses.update(e.id!, { supabaseId: row.id, pendingSync: false })
        logBusinessExpense(e, row.id)
      }
    } else {
      const { error } = await supabase.from('business_expenses').update(payload).eq('id', e.supabaseId)
      if (!error) await db.businessExpenses.update(e.id!, { pendingSync: false })
    }
  }

  // Orders — must sync before payments (payments need order's supabaseId)
  const pendingOrders = await db.orders.filter(o => !!o.pendingSync).toArray()
  for (const o of pendingOrders) {
    const payload = {
      customer_name: o.customerName, description: o.description,
      quantity: o.quantity ?? null, time: o.time ?? null,
      order_date: o.orderDate, due_date: o.dueDate,
      total_amount: o.totalAmount, deposit_paid: o.depositPaid,
      is_done: o.isDone, notes: o.notes ?? null,
    }
    if (!o.supabaseId) {
      const { data: row, error } = await supabase.from('orders').insert(payload).select().single()
      if (!error) {
        await db.orders.update(o.id!, { supabaseId: row.id, pendingSync: false })
        logOrder(o, row.id)
      }
    } else {
      const { error } = await supabase.from('orders').update(payload).eq('id', o.supabaseId)
      if (!error) await db.orders.update(o.id!, { pendingSync: false })
    }
  }

  // Payments — after orders so supabaseId is available
  const pendingPayments = await db.payments.filter(p => !!p.pendingSync).toArray()
  for (const p of pendingPayments) {
    const order = await db.orders.get(p.orderId)
    if (!order?.supabaseId) continue
    const payload = {
      order_id: order.supabaseId, amount: p.amount,
      type: p.type, paid_at: p.paidAt, notes: p.notes ?? null,
    }
    if (!p.supabaseId) {
      const { data: row, error } = await supabase.from('payments').insert(payload).select().single()
      if (!error) {
        await db.payments.update(p.id!, { supabaseId: row.id, pendingSync: false })
        logPayment({
          customerName: order.customerName, orderDesc: order.description,
          amount: p.amount, type: p.type, paidAt: p.paidAt, notes: p.notes,
        }, row.id)
      }
    } else {
      const { error } = await supabase.from('payments').update(payload).eq('id', p.supabaseId)
      if (!error) await db.payments.update(p.id!, { pendingSync: false })
    }
  }
}

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
        expenseType: r.expense_type ?? undefined, receiptUrl: r.receipt_url ?? undefined,
        amountPaid: r.amount_paid ?? undefined,
      }))
    )

    await db.businessExpenses.bulkAdd(
      (be.data ?? []).map(r => ({
        supabaseId: r.id, name: r.name, amount: r.amount, dueDate: r.due_date,
        modeOfPayment: r.mode_of_payment, isPaid: r.is_paid, isRecurring: r.is_recurring ?? false,
        category: r.category, notes: r.notes,
        expenseType: r.expense_type ?? undefined, receiptUrl: r.receipt_url ?? undefined,
        amountPaid: r.amount_paid ?? undefined,
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
