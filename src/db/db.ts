import Dexie, { type EntityTable } from 'dexie'

export interface PersonalExpense {
  id?: number
  supabaseId?: string
  pendingSync?: boolean
  name: string
  amount: number
  dueDate: string
  modeOfPayment?: string
  category?: string
  isPaid: boolean
  isRecurring: boolean
  notes?: string
  expenseType?: 'one-time' | 'monthly' | 'instant'
  receiptUrl?: string
  amountPaid?: number
  loggedBy?: string
}

export interface BusinessExpense {
  id?: number
  supabaseId?: string
  pendingSync?: boolean
  name: string
  amount: number
  dueDate: string
  modeOfPayment?: string
  isPaid: boolean
  isRecurring?: boolean
  category: string
  notes?: string
  expenseType?: 'one-time' | 'monthly' | 'instant'
  receiptUrl?: string
  amountPaid?: number
  loggedBy?: string
}

export interface Order {
  id?: number
  supabaseId?: string
  pendingSync?: boolean
  customerName: string
  description: string
  quantity?: number
  time?: string
  orderDate: string
  dueDate: string
  totalAmount: number
  depositPaid: number
  isDone: boolean
  notes?: string
  fulfillmentType?: 'delivery' | 'pickup'
  loggedBy?: string
}

export interface Payment {
  id?: number
  supabaseId?: string
  pendingSync?: boolean
  orderId: number
  amount: number
  paidAt: string
  type: 'deposit' | 'balance' | 'full'
  notes?: string
  loggedBy?: string
}

export interface Customer {
  id?: number
  supabaseId?: string
  name: string
  phone?: string
  notes?: string
  loggedBy?: string
}

export interface InventoryItem {
  id?: number
  name: string
  category: string
  quantity: number
  unit: string
  minStock?: number
  notes?: string
  updatedAt: string
}

class FlowerShopDB extends Dexie {
  personalExpenses!: EntityTable<PersonalExpense, 'id'>
  businessExpenses!: EntityTable<BusinessExpense, 'id'>
  orders!: EntityTable<Order, 'id'>
  payments!: EntityTable<Payment, 'id'>
  customers!: EntityTable<Customer, 'id'>
  inventory!: EntityTable<InventoryItem, 'id'>

  constructor() {
    super('FlowerShopDB')
    this.version(1).stores({
      personalExpenses: '++id, dueDate, isPaid, isRecurring',
      businessExpenses: '++id, dueDate, isPaid, category',
      orders: '++id, customerName, orderDate, dueDate, isDone',
      payments: '++id, orderId, paidAt, type',
    })
    this.version(2).stores({
      customers: '++id, name',
    })
    this.version(3).stores({
      passkeys: '++id, credentialId',
    })
    this.version(4).stores({
      personalExpenses: '++id, dueDate, isPaid, isRecurring, supabaseId',
      businessExpenses: '++id, dueDate, isPaid, category, supabaseId',
      orders: '++id, customerName, orderDate, dueDate, isDone, supabaseId',
      payments: '++id, orderId, paidAt, type, supabaseId',
      customers: '++id, name, supabaseId',
    })
    this.version(5).stores({
      inventory: '++id, category, name',
    })
    this.version(6).stores({
      personalExpenses: '++id, dueDate, isPaid, isRecurring, supabaseId, pendingSync',
      businessExpenses: '++id, dueDate, isPaid, category, supabaseId, pendingSync',
      orders: '++id, customerName, orderDate, dueDate, isDone, supabaseId, pendingSync',
      payments: '++id, orderId, paidAt, type, supabaseId, pendingSync',
    })
    this.version(7).stores({
      personalExpenses: '++id, dueDate, isPaid, isRecurring, supabaseId, pendingSync, expenseType',
      businessExpenses: '++id, dueDate, isPaid, isRecurring, category, supabaseId, pendingSync, expenseType',
    })
    this.version(8).stores({
      passkeys: null,
    })
  }
}

export const db = new FlowerShopDB()
