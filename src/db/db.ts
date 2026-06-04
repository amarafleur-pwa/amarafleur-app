import Dexie, { type EntityTable } from 'dexie'

export interface PersonalExpense {
  id?: number
  name: string
  amount: number
  dueDate: string
  isPaid: boolean
  isRecurring: boolean
  notes?: string
}

export interface BusinessExpense {
  id?: number
  name: string
  amount: number
  dueDate: string
  isPaid: boolean
  category: string
  notes?: string
}

export interface Order {
  id?: number
  customerName: string
  description: string
  orderDate: string
  dueDate: string
  totalAmount: number
  depositPaid: number
  isDone: boolean
  notes?: string
}

export interface Payment {
  id?: number
  orderId: number
  amount: number
  paidAt: string
  type: 'deposit' | 'balance' | 'full'
  notes?: string
}

class FlowerShopDB extends Dexie {
  personalExpenses!: EntityTable<PersonalExpense, 'id'>
  businessExpenses!: EntityTable<BusinessExpense, 'id'>
  orders!: EntityTable<Order, 'id'>
  payments!: EntityTable<Payment, 'id'>

  constructor() {
    super('FlowerShopDB')
    this.version(1).stores({
      personalExpenses: '++id, dueDate, isPaid, isRecurring',
      businessExpenses: '++id, dueDate, isPaid, category',
      orders: '++id, customerName, orderDate, dueDate, isDone',
      payments: '++id, orderId, paidAt, type',
    })
  }
}

export const db = new FlowerShopDB()
