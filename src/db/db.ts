import Dexie, { type EntityTable } from 'dexie'

export interface PersonalExpense {
  id?: number
  supabaseId?: string
  name: string
  amount: number
  dueDate: string
  category?: string
  isPaid: boolean
  isRecurring: boolean
  notes?: string
}

export interface BusinessExpense {
  id?: number
  supabaseId?: string
  name: string
  amount: number
  dueDate: string
  modeOfPayment?: string
  isPaid: boolean
  category: string
  notes?: string
}

export interface Order {
  id?: number
  supabaseId?: string
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
}

export interface Payment {
  id?: number
  supabaseId?: string
  orderId: number
  amount: number
  paidAt: string
  type: 'deposit' | 'balance' | 'full'
  notes?: string
}

export interface Customer {
  id?: number
  supabaseId?: string
  name: string
  phone?: string
  notes?: string
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

export interface Passkey {
  id?: number
  credentialId: string
  userName: string
  registeredAt: string
}

class FlowerShopDB extends Dexie {
  personalExpenses!: EntityTable<PersonalExpense, 'id'>
  businessExpenses!: EntityTable<BusinessExpense, 'id'>
  orders!: EntityTable<Order, 'id'>
  payments!: EntityTable<Payment, 'id'>
  customers!: EntityTable<Customer, 'id'>
  passkeys!: EntityTable<Passkey, 'id'>
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
  }
}

export const db = new FlowerShopDB()
