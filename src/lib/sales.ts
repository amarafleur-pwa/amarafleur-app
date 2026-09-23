import type { Order } from '../db/db'

export const isSmSales = (o: Order) => o.customerName.trim().toLowerCase().includes('sm sales')
