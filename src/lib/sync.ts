import { supabase } from './supabase'
import { dbWrite } from './dbGateway'
import { db } from '../db/db'
import { logPersonalExpense, logBusinessExpense, logOrder, logAdvanceOrder, logPayment } from './sheets'

// Every insert of an order/payment and every sync+restore runs through this queue one at a time,
// so a form's insert can't race syncPendingItems (double insert) or restore (row wiped/duplicated).
let lock: Promise<unknown> = Promise.resolve()
export function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lock.then(fn, fn)
  lock = run.catch(() => {})
  return run
}

let queuedSync: Promise<void> | null = null
export function runSync(): Promise<void> {
  if (queuedSync) return queuedSync
  queuedSync = withSyncLock(async () => {
    queuedSync = null
    await syncPendingItems()
    await restoreFromSupabase()
  })
  return queuedSync
}

async function syncPendingItems(): Promise<void> {
  if (!navigator.onLine) return

  // Personal expenses
  const pendingPE = await db.personalExpenses.filter(e => !!e.pendingSync).toArray()
  for (const e of pendingPE) {
    const payload = {
      name: e.name, amount: e.amount, due_date: e.dueDate,
      mode_of_payment: e.modeOfPayment ?? null,
      category: e.category ?? null, is_paid: e.isPaid,
      is_recurring: e.isRecurring, notes: e.notes ?? null,
      expense_type: e.expenseType ?? null, receipt_url: e.receiptUrl ?? null,
      amount_paid: e.amountPaid ?? null, logged_by: e.loggedBy ?? null,
    }
    if (!e.supabaseId) {
      const { data: row, error } = await dbWrite<{ id: string }>('personal_expenses', 'insert', { payload, select: true, single: true })
      if (!error && row) {
        await db.personalExpenses.update(e.id!, { supabaseId: row.id, pendingSync: false })
        logPersonalExpense(e, row.id)
      } else {
        console.warn('[sync] personal_expenses insert failed', e.id, error?.message)
      }
    } else {
      const { error } = await dbWrite('personal_expenses', 'update', { payload, eq: { id: e.supabaseId } })
      if (!error) await db.personalExpenses.update(e.id!, { pendingSync: false })
      else console.warn('[sync] personal_expenses update failed', e.id, error.message)
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
      amount_paid: e.amountPaid ?? null, logged_by: e.loggedBy ?? null,
    }
    if (!e.supabaseId) {
      const { data: row, error } = await dbWrite<{ id: string }>('business_expenses', 'insert', { payload, select: true, single: true })
      if (!error && row) {
        await db.businessExpenses.update(e.id!, { supabaseId: row.id, pendingSync: false })
        logBusinessExpense(e, row.id)
      } else {
        console.warn('[sync] business_expenses insert failed', e.id, error?.message)
      }
    } else {
      const { error } = await dbWrite('business_expenses', 'update', { payload, eq: { id: e.supabaseId } })
      if (!error) await db.businessExpenses.update(e.id!, { pendingSync: false })
      else console.warn('[sync] business_expenses update failed', e.id, error.message)
    }
  }

  // Orders — must sync before payments (payments need order's supabaseId)
  const pendingOrders = await db.orders.filter(o => !!o.pendingSync).toArray()
  for (const o of pendingOrders) {
    const payload = {
      customer_name: o.customerName, description: o.description,
      fulfillment_type: o.fulfillmentType ?? 'pickup',
      quantity: o.quantity ?? null,
      order_date: o.orderDate, due_date: o.dueDate,
      total_amount: o.totalAmount, deposit_paid: o.depositPaid,
      is_done: o.isDone, notes: o.notes ?? null,
      mode_of_payment: o.modeOfPayment ?? null, logged_by: o.loggedBy ?? null,
    }
    if (!o.supabaseId) {
      const freshO = await db.orders.get(o.id!)
      if (!freshO || !freshO.pendingSync || freshO.supabaseId) continue
      const { data: row, error } = await dbWrite<{ id: string }>('orders', 'insert', { payload, select: true, single: true })
      if (!error && row) {
        await db.orders.update(o.id!, { supabaseId: row.id, pendingSync: false })
        if (o.isDone) logOrder(o, row.id)
        else logAdvanceOrder(o, row.id)
      } else {
        console.warn('[sync] orders insert failed', o.id, error?.message)
      }
    } else {
      const { error } = await dbWrite('orders', 'update', { payload, eq: { id: o.supabaseId } })
      if (!error) await db.orders.update(o.id!, { pendingSync: false })
      else console.warn('[sync] orders update failed', o.id, error.message)
    }
  }

  // Payments — after orders so supabaseId is available
  const pendingPayments = await db.payments.filter(p => !!p.pendingSync).toArray()
  for (const p of pendingPayments) {
    const order = await db.orders.get(p.orderId)
    if (!order?.supabaseId) continue
    const payload = {
      order_id: order.supabaseId, amount: p.amount,
      type: p.type, paid_at: p.paidAt, notes: p.notes ?? null, logged_by: p.loggedBy ?? null,
    }
    if (!p.supabaseId) {
      const freshP = await db.payments.get(p.id!)
      if (!freshP || !freshP.pendingSync || freshP.supabaseId) continue
      const { data: row, error } = await dbWrite<{ id: string }>('payments', 'insert', { payload, select: true, single: true })
      if (!error && row) {
        await db.payments.update(p.id!, { supabaseId: row.id, pendingSync: false })
        const allPmts = await db.payments.where('orderId').equals(order.id!).toArray()
        const totalPaid = order.depositPaid + allPmts.reduce((s, pp) => s + pp.amount, 0)
        if (totalPaid >= order.totalAmount) {
          logPayment({
            customerName: order.customerName, orderDesc: order.description,
            amount: order.totalAmount, type: p.type, paidAt: p.paidAt, notes: p.notes, loggedBy: p.loggedBy,
          }, row.id)
        }
      } else {
        console.warn('[sync] payments insert failed', p.id, error?.message)
      }
    } else {
      const { error } = await dbWrite('payments', 'update', { payload, eq: { id: p.supabaseId } })
      if (!error) await db.payments.update(p.id!, { pendingSync: false })
      else console.warn('[sync] payments update failed', p.id, error.message)
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
    // Keep local IDs stable (open forms hold them) and keep rows not yet in Supabase
    const orderIdBySid = new Map((await db.orders.toArray()).filter(o => o.supabaseId).map(o => [o.supabaseId!, o.id!]))
    const paymentIdBySid = new Map((await db.payments.toArray()).filter(p => p.supabaseId).map(p => [p.supabaseId!, p.id!]))
    const peIdBySid = new Map((await db.personalExpenses.toArray()).filter(e => e.supabaseId).map(e => [e.supabaseId!, e.id!]))
    const beIdBySid = new Map((await db.businessExpenses.toArray()).filter(e => e.supabaseId).map(e => [e.supabaseId!, e.id!]))

    await Promise.all([
      db.personalExpenses.filter(e => !!e.supabaseId).delete(),
      db.businessExpenses.filter(e => !!e.supabaseId).delete(),
      db.orders.filter(o => !!o.supabaseId).delete(),
      db.payments.filter(p => !!p.supabaseId).delete(),
      db.customers.clear(),
    ])

    await db.personalExpenses.bulkAdd(
      (pe.data ?? []).map(r => ({
        ...(peIdBySid.has(r.id) ? { id: peIdBySid.get(r.id) } : {}),
        supabaseId: r.id, name: r.name, amount: r.amount, dueDate: r.due_date,
        modeOfPayment: r.mode_of_payment ?? undefined,
        category: r.category, isPaid: r.is_paid, isRecurring: r.is_recurring, notes: r.notes,
        expenseType: r.expense_type ?? undefined, receiptUrl: r.receipt_url ?? undefined,
        amountPaid: r.amount_paid ?? undefined, loggedBy: r.logged_by ?? undefined,
      }))
    )

    await db.businessExpenses.bulkAdd(
      (be.data ?? []).map(r => ({
        ...(beIdBySid.has(r.id) ? { id: beIdBySid.get(r.id) } : {}),
        supabaseId: r.id, name: r.name, amount: r.amount, dueDate: r.due_date,
        modeOfPayment: r.mode_of_payment, isPaid: r.is_paid, isRecurring: r.is_recurring ?? false,
        category: r.category, notes: r.notes,
        expenseType: r.expense_type ?? undefined, receiptUrl: r.receipt_url ?? undefined,
        amountPaid: r.amount_paid ?? undefined, loggedBy: r.logged_by ?? undefined,
      }))
    )

    const orderRows = ord.data ?? []
    const orderKeys = await db.orders.bulkAdd(
      orderRows.map(r => ({
        ...(orderIdBySid.has(r.id) ? { id: orderIdBySid.get(r.id) } : {}),
        supabaseId: r.id, customerName: r.customer_name, description: r.description,
        fulfillmentType: r.fulfillment_type ?? 'pickup',
        quantity: r.quantity, time: r.time, orderDate: r.order_date, dueDate: r.due_date,
        totalAmount: r.total_amount, depositPaid: r.deposit_paid, isDone: r.is_done, notes: r.notes,
        modeOfPayment: r.mode_of_payment ?? undefined,
        loggedBy: r.logged_by ?? undefined,
      })),
      { allKeys: true },
    )
    const localOrderIdBySid = new Map(orderRows.map((r, i) => [r.id, orderKeys[i] as number]))

    await db.payments.bulkAdd(
      (pay.data ?? []).map(r => ({
        ...(paymentIdBySid.has(r.id) ? { id: paymentIdBySid.get(r.id) } : {}),
        supabaseId: r.id,
        orderId: localOrderIdBySid.get(r.order_id) ?? 0,
        amount: r.amount, paidAt: r.paid_at,
        type: r.type as 'deposit' | 'balance' | 'full',
        notes: r.notes, loggedBy: r.logged_by ?? undefined,
      }))
    )

    // Drop payments whose order no longer exists (deleted elsewhere)
    const orderIds = new Set(await db.orders.toCollection().primaryKeys())
    await db.payments.filter(p => !orderIds.has(p.orderId)).delete()

    await db.customers.bulkAdd(
      (cust.data ?? []).map(r => ({
        supabaseId: r.id, name: r.name, phone: r.phone, notes: r.notes,
        loggedBy: r.logged_by ?? undefined,
      }))
    )
  })
}
