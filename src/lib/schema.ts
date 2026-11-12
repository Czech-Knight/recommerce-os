export const schema = `
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
 password_hash TEXT, role TEXT NOT NULL CHECK (role IN ('customer','seller','merchant','admin')),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','pending','suspended')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_attempts (
 email TEXT PRIMARY KEY, attempts INT NOT NULL DEFAULT 0, window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY, seller_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', brand TEXT NOT NULL DEFAULT '', category TEXT NOT NULL,
 condition TEXT NOT NULL, size TEXT NOT NULL, sku TEXT UNIQUE NOT NULL,
 price_cents INT NOT NULL CHECK(price_cents > 0), stock INT NOT NULL CHECK(stock >= 0),
 image_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('active','pending','archived')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shops (
 id TEXT PRIMARY KEY, domain TEXT UNIQUE NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id),
 token_encrypted TEXT, scopes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'connected',
 location_id TEXT, currency TEXT NOT NULL DEFAULT 'AUD', last_sync_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS product_links (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), shop_id TEXT NOT NULL REFERENCES shops(id),
 variant_id TEXT NOT NULL, inventory_item_id TEXT NOT NULL, shopify_product_id TEXT NOT NULL,
 UNIQUE(shop_id, variant_id), UNIQUE(product_id,shop_id)
);
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, customer_id TEXT REFERENCES users(id), source TEXT NOT NULL,
 external_id TEXT NOT NULL, request_hash TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('paid','awaiting_payment','processing','shipped','cancelled','returned')),
 total_cents INT NOT NULL CHECK(total_cents >= 0), discount_cents INT NOT NULL DEFAULT 0,
 currency TEXT NOT NULL DEFAULT 'AUD', customer_name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(source, external_id)
);
CREATE TABLE IF NOT EXISTS order_items (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL REFERENCES products(id),
 seller_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 quantity INT NOT NULL CHECK(quantity > 0), price_cents INT NOT NULL CHECK(price_cents >= 0),
 status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','shipped','cancelled','returned')),
 UNIQUE(order_id,product_id)
);
CREATE TABLE IF NOT EXISTS inventory_movements (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id), order_id TEXT REFERENCES orders(id),
 delta INT NOT NULL, reason TEXT NOT NULL, event_key TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_events (
 id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES shops(id), event_id TEXT NOT NULL, topic TEXT NOT NULL,
 payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INT NOT NULL DEFAULT 0,
 error TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), processed_at TIMESTAMPTZ,
 UNIQUE(shop_id,topic,event_id)
);
CREATE TABLE IF NOT EXISTS outbox (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', attempts INT NOT NULL DEFAULT 0, error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), message TEXT NOT NULL,
 read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id), action TEXT NOT NULL,
 entity_id TEXT NOT NULL, detail TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS returns (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), customer_id TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(order_id)
);
CREATE TABLE IF NOT EXISTS discounts (
 code TEXT PRIMARY KEY, percent INT NOT NULL CHECK(percent BETWEEN 1 AND 80), active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS oauth_states (
 state_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), shop TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller ON order_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_events_pending ON webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,created_at);
ALTER TABLE shops ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS refresh_expires_at TIMESTAMPTZ;
ALTER TABLE product_links ADD COLUMN IF NOT EXISTS catalog_owned BOOLEAN NOT NULL DEFAULT false;
`;
