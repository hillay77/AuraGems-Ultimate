require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createStorage } = require("./lib/storage");
const { getConfig, assertProductionConfig } = require("./lib/config");
const { createPayment, verifyPayment } = require("./lib/payment");
const cloudinary = require("./lib/cloudinary");
const config = getConfig();
assertProductionConfig(config);
const app = express(),
  UP = path.join(__dirname, "public/uploads"),
  storage = createStorage(config);
let db;
const statuses = [
  "Pending",
  "Confirmed",
  "Packed",
  "Dispatched",
  "Delivered",
  "Cancelled",
];
const fail = (s, n, e) => s.status(n).json({ error: e });
const str = (v, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const nextId = (a) =>
  a.length ? Math.max(...a.map((x) => +x.id || 0)) + 1 : 1;
const cookies = (r) =>
  Object.fromEntries(
    (r.headers.cookie || "")
      .split(";")
      .filter(Boolean)
      .map((v) => {
        const i = v.indexOf("=");
        return [v.slice(0, i).trim(), decodeURIComponent(v.slice(i + 1))];
      }),
  );
const admin = (r, s, n) => {
  try {
    const p = jwt.verify(cookies(r).aura_admin, config.jwtSecret);
    if (p.role !== "admin") throw Error();
    n();
  } catch (_) {
    fail(s, 401, "Unauthorized");
  }
};
const pageAdmin = (r, s, n) => {
  try {
    jwt.verify(cookies(r).aura_admin, config.jwtSecret);
    n();
  } catch (_) {
    s.redirect("/admin");
  }
};
const hits = new Map();
const limit = (r, s, n) => {
  const k = `${r.ip}:${r.path}`,
    now = Date.now(),
    a = (hits.get(k) || []).filter((x) => now - x < 60000);
  if (a.length >= config.rateLimit) return fail(s, 429, "Too many requests");
  a.push(now);
  hits.set(k, a);
  n();
};
const save = () => storage.save(db);
const redacted = (o) => ({
  id: o.id,
  status: o.status,
  total: o.total,
  currency: o.currency,
  paymentStatus: o.paymentStatus,
  tracking: o.tracking,
});
function priceCart(items, code) {
  if (!Array.isArray(items) || !items.length || items.length > 50)
    throw Error("Invalid cart");
  const q = new Map();
  for (const i of items) {
    const id = Number(i.id),
      qty = Number(i.qty);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1)
      throw Error("Invalid cart item");
    q.set(id, (q.get(id) || 0) + qty);
  }
  let total = 0;
  const priced = [];
  for (const [id, qty] of q) {
    const p = db.products.find((x) => +x.id === id);
    if (!p || qty > p.stock) throw Error("Insufficient stock");
    const line = p.price * qty;
    total += line;
    priced.push({
      id: p.id,
      name: p.name,
      price: p.price,
      qty,
      lineTotal: line,
    });
  }
  code = str(code, 40).toUpperCase();
  const coupon = code
    ? db.coupons.find((x) => x.active && x.code === code)
    : null;
  if (code && !coupon) throw Error("Invalid coupon");
  const discount = coupon
    ? Math.floor((total * Number(coupon.value)) / 100)
    : 0;
  return {
    items: priced,
    subtotal: total,
    discount,
    total: total - discount,
    coupon: coupon?.code || null,
  };
}
app.use(
  helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }),
);
app.use(express.json({ limit: "100kb", strict: true }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(limit);
app.use(express.static(path.join(__dirname, "public")));
app.get("/admin", (r, s) => {
  try {
    jwt.verify(cookies(r).aura_admin, config.jwtSecret);
    return s.redirect("/admin/dashboard");
  } catch (_) {}
  s.sendFile(path.join(__dirname, "views/login.html"));
});
app.get("/admin/dashboard", pageAdmin, (r, s) =>
  s.sendFile(path.join(__dirname, "views/dashboard.html")),
);
app.get("/admin/banners", pageAdmin, (r, s) =>
  s.sendFile(path.join(__dirname, "views/banners.html")),
);
app.get("/api/store", (r, s) =>
  s.json({
    products: db.products,
    categories: db.categories,
    reviews: db.reviews.filter((x) => x.approved),
    banners: (db.banners || []).filter((x) => x.active),
    content: db.content,
  }),
);
app.get("/api/products", (r, s) => {
  let x = [...db.products],
    { q, category, min, max, sort } = r.query;
  if (q)
    x = x.filter((p) =>
      `${p.name}${p.category}${p.description}`
        .toLowerCase()
        .includes(str(q, 100).toLowerCase()),
    );
  if (category) x = x.filter((p) => p.category === str(category, 80));
  if (min && Number.isFinite(+min)) x = x.filter((p) => p.price >= +min);
  if (max && Number.isFinite(+max)) x = x.filter((p) => p.price <= +max);
  if (sort === "price-asc") x.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") x.sort((a, b) => b.price - a.price);
  s.json(x);
});
app.post("/api/coupons/validate", (r, s) => {
  const c = db.coupons.find(
    (x) => x.active && x.code === str(r.body.code, 40).toUpperCase(),
  );
  c ? s.json(c) : fail(s, 404, "Invalid coupon");
});
app.post("/api/orders", async (r, s) => {
  try {
    const c = r.body.customer;
    if (
      !c ||
      !str(c.name, 100) ||
      !validEmail(c.email) ||
      !str(c.phone, 40) ||
      !str(c.address, 200) ||
      !str(c.city, 80)
    )
      return fail(s, 400, "Valid customer details are required");
    const calc = priceCart(r.body.items, r.body.coupon),
      token = crypto.randomBytes(32).toString("hex"),
      now = new Date().toISOString(),
      customer = {
        name: str(c.name, 100),
        email: str(c.email, 160).toLowerCase(),
        phone: str(c.phone, 40),
        address: str(c.address, 200),
        city: str(c.city, 80),
      },
      o = {
        id: `AGS-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
        customer,
        ...calc,
        currency: "UGX",
        status: "Pending",
        paymentStatus: config.paymentConfigured ? "Pending" : "Dev pending",
        paymentReference: null,
        trackingToken: token,
        createdAt: now,
        tracking: [{ status: "Order received", at: now }],
      };
    if (config.paymentConfigured) {
      const p = await createPayment(o, config);
      o.paymentReference = p.reference;
      o.paymentLink = p.link;
    }
    for (const i of calc.items)
      db.products.find((p) => +p.id === +i.id).stock -= i.qty;
    db.orders.unshift(o);
    if (!db.customers.some((x) => x.email === customer.email))
      db.customers.push({ ...customer, id: nextId(db.customers) });
    await save();
    s.status(201).json({
      id: o.id,
      total: o.total,
      currency: o.currency,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentLink: o.paymentLink || null,
      trackingToken: token,
    });
  } catch (e) {
    fail(
      s,
      e.message === "Invalid coupon" ? 400 : 409,
      e.message || "Unable to create order",
    );
  }
});
app.get("/api/orders/:id", (r, s) => {
  const o = db.orders.find((x) => x.id === r.params.id),
    token = str(r.query.token, 100),
    stored = String(o?.trackingToken || "");
  if (!o) return fail(s, 404, "Order not found");
  if (
    !token ||
    token.length !== stored.length ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(stored))
  )
    return fail(s, 403, "Tracking token required");
  s.json(redacted(o));
});
app.get("/api/orders/:id", (r, s) => {
  const o = db.orders.find((x) => x.id === r.params.id),
    token = str(r.query.token, 100),
    stored = String(o?.trackingToken || "");
  if (!o) return fail(s, 404, "Order not found");
  if (
    !token ||
    token.length !== stored.length ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(stored))
  )
    return fail(s, 403, "Tracking token required");
  s.json(redacted(o));
});
app.post(
  "/api/payments/flutterwave/webhook",
  express.raw({ type: "application/json", limit: "100kb" }),
  async (r, s) => {
    try {
      if (
        !config.paymentConfigured ||
        r.headers["verif-hash"] !== config.flutterwaveWebhookSecret
      )
        return s.sendStatus(401);
      const e =
          typeof r.body === "object" && r.body.data
            ? r.body
            : JSON.parse(r.body.toString()),
        o = db.orders.find(
          (x) =>
            x.paymentReference ===
            String(e.data?.tx_ref || e.data?.reference || ""),
        );
      if (
        o &&
        e.data?.status === "successful" &&
        (await verifyPayment(e.data.id, o, config))
      ) {
        o.paymentStatus = "Paid";
        o.status = "Confirmed";
        o.tracking.push({
          status: "Payment confirmed",
          at: new Date().toISOString(),
        });
        await save();
      }
      s.sendStatus(200);
    } catch (_) {
      s.sendStatus(400);
    }
  },
);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5e6, files: 1 },
  fileFilter: (r, f, c) =>
    c(null, ["image/jpeg", "image/png", "image/webp"].includes(f.mimetype)),
});
app.post("/api/admin/upload", admin, (r, s) =>
  upload.single("image")(r, s, async (e) => {
    try {
      if (e || !r.file)
        return fail(s, 400, "A JPEG, PNG, or WebP image up to 5MB is required");
      if (config.production && !cloudinary.configured(config))
        return fail(s, 503, "Cloudinary is required in production");
      if (cloudinary.configured(config))
        return s.json({ url: await cloudinary.upload(r.file, config) });
      const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${path.extname(r.file.originalname).toLowerCase()}`;
      fs.writeFileSync(path.join(UP, filename), r.file.buffer);
      s.json({ url: `/uploads/${filename}` });
    } catch (_) {
      fail(s, 502, "Image upload failed");
    }
  }),
);
app.post(
  "/api/payments/flutterwave/webhook",
  express.raw({ type: "application/json", limit: "100kb" }),
  async (r, s) => {
    try {
      if (
        !config.paymentConfigured ||
        r.headers["verif-hash"] !== config.flutterwaveWebhookSecret
      )
        return s.sendStatus(401);
      const e = JSON.parse(r.body.toString()),
        o = db.orders.find(
          (x) =>
            x.paymentReference ===
            String(e.data?.tx_ref || e.data?.reference || ""),
        );
      if (
        o &&
        e.data?.status === "successful" &&
        (await verifyPayment(e.data.id, o, config))
      ) {
        o.paymentStatus = "Paid";
        o.status = "Confirmed";
        o.tracking.push({
          status: "Payment confirmed",
          at: new Date().toISOString(),
        });
        await save();
      }
      s.sendStatus(200);
    } catch (_) {
      s.sendStatus(400);
    }
  },
);
app.get("/api/payments/flutterwave/verify/:id", async (r, s) => {
  try {
    const o = db.orders.find((x) => x.id === str(r.query.order, 40));
    if (!o) return fail(s, 404, "Order not found");
    if (!(await verifyPayment(r.params.id, o, config)))
      return fail(s, 400, "Payment not verified");
    o.paymentStatus = "Paid";
    o.status = "Confirmed";
    await save();
    s.json({ ok: true, status: o.status });
  } catch (_) {
    fail(s, 400, "Payment verification failed");
  }
});
app.post("/api/newsletter", async (r, s) => {
  if (!validEmail(r.body.email)) return fail(s, 400, "Valid email required");
  const e = r.body.email.toLowerCase();
  if (!db.newsletter.includes(e)) db.newsletter.push(e);
  await save();
  s.json({ ok: true });
});
app.post("/api/contact", async (r, s) => {
  if (
    !str(r.body.name, 100) ||
    !validEmail(r.body.email) ||
    !str(r.body.message, 2000)
  )
    return fail(s, 400, "Valid contact details required");
  db.contacts.unshift({
    id: nextId(db.contacts),
    name: str(r.body.name, 100),
    email: str(r.body.email, 160).toLowerCase(),
    message: str(r.body.message, 2000),
    createdAt: new Date().toISOString(),
  });
  await save();
  s.json({ ok: true });
});
app.post("/api/admin/login", (r, s) => {
  if (
    r.body.email !== config.adminEmail ||
    r.body.password !== config.adminPassword
  )
    return fail(s, 401, "Invalid credentials");
  const t = jwt.sign(
    { email: config.adminEmail, role: "admin" },
    config.jwtSecret,
    { expiresIn: "8h" },
  );
  s.setHeader(
    "Set-Cookie",
    `aura_admin=${encodeURIComponent(t)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${config.production ? "; Secure" : ""}`,
  );
  s.json({ ok: true });
});
app.post("/api/admin/logout", (r, s) => {
  s.setHeader(
    "Set-Cookie",
    `aura_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${config.production ? "; Secure" : ""}`,
  );
  s.json({ ok: true });
});
app.get("/api/admin/data", admin, (r, s) => s.json(db));
app.get("/api/admin/stats", admin, (r, s) =>
  s.json({
    revenue: db.orders
      .filter((x) => x.paymentStatus === "Paid")
      .reduce((a, x) => a + (+x.total || 0), 0),
    orders: db.orders.length,
    customers: db.customers.length,
    subscribers: db.newsletter.length,
    lowStock: db.products.filter((x) => x.stock < 10).length,
  }),
);
app.get("/api/admin/contacts", admin, (r, s) => s.json(db.contacts));
const reviewInput = (body) => {
  const name = body?.name,
    text = body?.text,
    rating = Number(body?.rating);
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 100 ||
    typeof text !== "string" ||
    !text.trim() ||
    text.trim().length > 2000 ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    typeof body?.approved !== "boolean"
  )
    return null;
  return { name: name.trim(), text: text.trim(), rating, approved: body.approved };
};
app.get("/api/admin/reviews", admin, (r, s) => s.json(db.reviews || []));
app.post("/api/admin/reviews", admin, async (r, s) => {
  const input = reviewInput(r.body);
  if (!input) return fail(s, 400, "Valid name, text, rating, and approved status required");
  const review = { id: nextId(db.reviews || []), ...input };
  db.reviews.unshift(review);
  await save();
  s.status(201).json(review);
});
app.put("/api/admin/reviews/:id", admin, async (r, s) => {
  const review = (db.reviews || []).find((x) => x.id == r.params.id),
    input = reviewInput(r.body);
  if (!review) return fail(s, 404, "Review not found");
  if (!input) return fail(s, 400, "Valid name, text, rating, and approved status required");
  Object.assign(review, input);
  await save();
  s.json(review);
});
app.delete("/api/admin/reviews/:id", admin, async (r, s) => {
  const reviews = (db.reviews || []).filter((x) => x.id != r.params.id);
  if (reviews.length === (db.reviews || []).length) return fail(s, 404, "Review not found");
  db.reviews = reviews;
  await save();
  s.json({ ok: true });
});
app.put("/api/admin/contacts/:id", admin, async (r, s) => {
  const contact = db.contacts.find((x) => x.id == r.params.id);
  const name = str(r.body.name, 100),
    email = str(r.body.email, 160).toLowerCase(),
    message = str(r.body.message, 2000);
  if (!contact) return fail(s, 404, "Contact not found");
  if (!name || !validEmail(email) || !message)
    return fail(s, 400, "Valid contact details required");
  contact.name = name;
  contact.email = email;
  contact.message = message;
  await save();
  s.json(contact);
});
app.delete("/api/admin/contacts/:id", admin, async (r, s) => {
  const contacts = db.contacts.filter((x) => x.id != r.params.id);
  if (contacts.length === db.contacts.length)
    return fail(s, 404, "Contact not found");
  db.contacts = contacts;
  await save();
  s.json({ ok: true });
});
app.put("/api/admin/content", admin, async (r, s) => {
  db.content = { ...db.content, ...r.body };
  await save();
  s.json(db.content);
});
app.post("/api/admin/content", admin, async (r, s) => {
  db.content = { ...db.content, ...r.body };
  await save();
  s.json(db.content);
});
app.post("/api/admin/reload", admin, async (r, s) => {
  db = await storage.load();
  s.json({ ok: true });
});
app.post("/api/admin/products", admin, async (r, s) => {
  const price = Number(r.body.price),
    stock = Number(r.body.stock);
  if (
    !str(r.body.name, 120) ||
    !Number.isSafeInteger(price) ||
    price < 0 ||
    !Number.isSafeInteger(stock) ||
    stock < 0
  )
    return fail(s, 400, "Invalid product");
  const p = {
    id: nextId(db.products),
    rating: 5,
    ...r.body,
    price,
    stock,
    oldPrice: r.body.oldPrice ? Number(r.body.oldPrice) : null,
  };
  db.products.push(p);
  await save();
  s.json(p);
});
app.put("/api/admin/products/:id", admin, async (r, s) => {
  const i = db.products.findIndex((x) => x.id == r.params.id),
    price = Number(r.body.price),
    stock = Number(r.body.stock);
  if (i < 0) return fail(s, 404, "Product not found");
  if (
    !Number.isSafeInteger(price) ||
    price < 0 ||
    !Number.isSafeInteger(stock) ||
    stock < 0
  )
    return fail(s, 400, "Invalid product");
  db.products[i] = {
    ...db.products[i],
    ...r.body,
    id: db.products[i].id,
    price,
    stock,
    oldPrice: r.body.oldPrice ? Number(r.body.oldPrice) : null,
  };
  await save();
  s.json(db.products[i]);
});
app.delete("/api/admin/products/:id", admin, async (r, s) => {
  db.products = db.products.filter((x) => x.id != r.params.id);
  await save();
  s.json({ ok: true });
});
app.post("/api/admin/banners", admin, async (r, s) => {
  const b = {
    id: nextId(db.banners || []),
    ...r.body,
    active: r.body.active === true || r.body.active === "true",
  };
  db.banners.unshift(b);
  await save();
  s.json(b);
});
app.put("/api/admin/banners/:id", admin, async (r, s) => {
  const i = db.banners.findIndex((x) => x.id == r.params.id);
  if (i < 0) return fail(s, 404, "Not found");
  db.banners[i] = {
    ...db.banners[i],
    ...r.body,
    active: r.body.active === true || r.body.active === "true",
  };
  await save();
  s.json(db.banners[i]);
});
app.delete("/api/admin/banners/:id", admin, async (r, s) => {
  db.banners = db.banners.filter((x) => x.id != r.params.id);
  await save();
  s.json({ ok: true });
});
app.put("/api/admin/orders/:id", admin, async (r, s) => {
  const o = db.orders.find((x) => x.id === r.params.id);
  if (!o || !statuses.includes(r.body.status))
    return fail(s, 400, "Invalid order update");
  o.status = r.body.status;
  o.tracking.push({ status: o.status, at: new Date().toISOString() });
  await save();
  s.json(o);
});
app.get("*", (r, s) => s.sendFile(path.join(__dirname, "public/index.html")));
async function start() {
  db = await storage.load();
  fs.mkdirSync(UP, { recursive: true });
  let port = config.port;
  return new Promise((resolve, reject) => {
    const listen = () => {
      const server = app.listen(port, () => {
        console.log(`AuraGems: http://localhost:${port}`);
        resolve(server);
      });
      server.once("error", (error) => {
        if (error.code === "EADDRINUSE") {
          console.warn(`Port ${port} is in use, trying ${port + 1}...`);
          port++;
          listen();
        } else reject(error);
      });
    };
    listen();
  });
}
if (require.main === module)
  start().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
module.exports = { app, start, priceCart, config };
