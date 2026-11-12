export type Role = "admin" | "merchant" | "seller" | "customer";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
}
export interface Product {
  id: string;
  seller_id: string;
  seller_name?: string;
  title: string;
  description: string;
  brand: string;
  category: string;
  condition: string;
  size: string;
  sku: string;
  price_cents: number;
  stock: number;
  image_url: string;
  status: string;
  created_at: string;
  linked?: boolean;
}
export interface OrderItem {
  id: string;
  product_id: string;
  seller_id: string;
  title: string;
  quantity: number;
  price_cents: number;
  status: string;
}
export interface Order {
  id: string;
  source: string;
  external_id: string;
  status: string;
  total_cents: number;
  discount_cents: number;
  currency: string;
  customer_name: string;
  created_at: string;
  items: OrderItem[];
}
export interface Job {
  id: string;
  kind?: string;
  topic?: string;
  status: string;
  attempts: number;
  error: string | null;
  created_at: string;
}
export interface State {
  demo: boolean;
  user: User | null;
  products: Product[];
  orders: Order[];
  sellers: User[];
  shops: {
    id: string;
    domain: string;
    status: string;
    last_sync_at: string | null;
  }[];
  jobs: Job[];
  notifications: {
    id: string;
    message: string;
    read_at: string | null;
    created_at: string;
  }[];
  audit: { id: string; action: string; detail: string; created_at: string }[];
  returns: { id: string; order_id: string; reason: string; status: string }[];
  discounts: { code: string; percent: number; active: boolean }[];
  stats: { revenue: number; orders: number; stock: number; sellers: number };
}
