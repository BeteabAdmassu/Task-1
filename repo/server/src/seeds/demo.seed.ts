/**
 * Demo seed — non-production only.
 *
 * Creates one user per core role, one supplier (linked to the supplier user),
 * a purchase request, its derived PO, a knowledge-base article, and a few
 * notifications so every module has minimal data for an E2E walkthrough.
 *
 * Safe to re-run: records are skipped when they already exist.
 *
 * Usage:
 *   cd repo/server
 *   npm run seed:demo
 *
 * Environment variables (same as server):
 *   DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME  (defaults match local dev)
 */

import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import DataSource from '../config/data-source';

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: seed:demo must not run in production (NODE_ENV=production).');
  process.exit(1);
}

const DEMO_PASSWORD = 'Demo1234!';
const BCRYPT_ROUNDS = 10;

const USERS = [
  { username: 'demo_admin',      role: 'ADMINISTRATOR'        },
  { username: 'demo_pm',         role: 'PROCUREMENT_MANAGER'  },
  { username: 'demo_clerk',      role: 'WAREHOUSE_CLERK'      },
  { username: 'demo_plantcare',  role: 'PLANT_CARE_SPECIALIST'},
  { username: 'demo_supplier',   role: 'SUPPLIER'             },
];

async function main() {
  console.log('Connecting to database…');
  await DataSource.initialize();
  const qr = DataSource.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();

  try {
    const hash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

    // ── 1. Users ──────────────────────────────────────────────────────────────
    const userIds: Record<string, string> = {};
    for (const u of USERS) {
      const existing = await qr.query(
        `SELECT id FROM users WHERE username = $1`,
        [u.username],
      );
      if (existing.length > 0) {
        userIds[u.username] = existing[0].id;
        console.log(`  skip user: ${u.username} (already exists)`);
        continue;
      }
      const rows = await qr.query(
        `INSERT INTO users (username, "passwordHash", role, "isActive", "mustChangePassword")
         VALUES ($1, $2, $3, true, false)
         RETURNING id`,
        [u.username, hash, u.role],
      );
      userIds[u.username] = rows[0].id;
      console.log(`  created user: ${u.username} (${u.role})`);
    }

    // ── 2. Supplier ───────────────────────────────────────────────────────────
    let supplierId: string;
    const existingSupplier = await qr.query(
      `SELECT id FROM suppliers WHERE name = 'Demo Supplier Inc.'`,
    );
    if (existingSupplier.length > 0) {
      supplierId = existingSupplier[0].id;
      console.log('  skip supplier: Demo Supplier Inc. (already exists)');
    } else {
      const rows = await qr.query(
        `INSERT INTO suppliers (name, "contactName", email, "paymentTerms", "isActive")
         VALUES ('Demo Supplier Inc.', 'Sam Supplier', 'sam@demo-supplier.example', 'NET_30', true)
         RETURNING id`,
      );
      supplierId = rows[0].id;
      console.log(`  created supplier: Demo Supplier Inc. (${supplierId})`);
    }

    // Link supplier user to the supplier record
    if (userIds['demo_supplier']) {
      await qr.query(
        `UPDATE users SET "supplierId" = $1 WHERE id = $2`,
        [supplierId, userIds['demo_supplier']],
      );
    }

    // ── 3. Purchase Request (auto-approve tier: $200) ─────────────────────────
    const existingPr = await qr.query(
      `SELECT id FROM purchase_requests WHERE title = 'Demo: Potting Mix Restock'`,
    );
    let prId: string;
    if (existingPr.length > 0) {
      prId = existingPr[0].id;
      console.log('  skip purchase request (already exists)');
    } else {
      const prSeq = await qr.query(`SELECT nextval('pr_number_seq') AS seq`);
      const prNumber = `PR-${new Date().getFullYear()}-${String(prSeq[0].seq).padStart(5, '0')}`;
      const prRows = await qr.query(
        `INSERT INTO purchase_requests
           ("requestNumber", title, description, "requestedBy", "supplierId",
            "totalAmount", status, "approvalTier")
         VALUES ($1, $2, $3, $4, $5, 200.00, 'APPROVED', 0)
         RETURNING id`,
        [
          prNumber,
          'Demo: Potting Mix Restock',
          'Automated demo seed — potting mix restock for greenhouse A.',
          userIds['demo_pm'],
          supplierId,
        ],
      );
      prId = prRows[0].id;

      // Line item
      await qr.query(
        `INSERT INTO purchase_request_line_items
           ("requestId", "itemDescription", quantity, "unitPrice", "totalPrice")
         VALUES ($1, 'Premium Potting Mix (20 L bag)', 10, 20.00, 200.00)`,
        [prId],
      );
      console.log(`  created purchase request: ${prNumber}`);
    }

    // ── 4. Purchase Order ─────────────────────────────────────────────────────
    const existingPo = await qr.query(
      `SELECT id FROM purchase_orders WHERE "requestId" = $1`,
      [prId],
    );
    let poId: string;
    if (existingPo.length > 0) {
      poId = existingPo[0].id;
      console.log('  skip PO (already exists)');
    } else {
      const poSeq = await qr.query(`SELECT nextval('po_number_seq') AS seq`);
      const poNumber = `PO-${new Date().getFullYear()}-${String(poSeq[0].seq).padStart(5, '0')}`;
      const poRows = await qr.query(
        `INSERT INTO purchase_orders
           ("poNumber", "requestId", "supplierId", "totalAmount", status, "createdBy")
         VALUES ($1, $2, $3, 200.00, 'DRAFT', $4)
         RETURNING id`,
        [poNumber, prId, supplierId, userIds['demo_pm']],
      );
      poId = poRows[0].id;

      await qr.query(
        `INSERT INTO purchase_order_line_items
           ("poId", description, quantity, "unitPrice", "totalPrice", "quantityReceived")
         VALUES ($1, 'Premium Potting Mix (20 L bag)', 10, 20.00, 200.00, 0)`,
        [poId],
      );
      console.log(`  created PO: ${poNumber}`);
    }

    // ── 5. Knowledge Base Article ─────────────────────────────────────────────
    const existingArticle = await qr.query(
      `SELECT id FROM articles WHERE title = 'Demo: Caring for Tropical Houseplants'`,
    );
    if (existingArticle.length === 0) {
      const artRows = await qr.query(
        `INSERT INTO articles
           (slug, title, content, category, status, tags, "authorId")
         VALUES ('demo-caring-for-tropical-houseplants', $1, $2, 'CARE_GUIDE', 'STOREWIDE', ARRAY['demo','tropicals'], $3)
         RETURNING id`,
        [
          'Demo: Caring for Tropical Houseplants',
          'Tropical houseplants thrive in indirect light and humidity above 50%. '
            + 'Water when the top inch of soil is dry. Fertilise monthly in spring and summer.',
          userIds['demo_plantcare'] ?? userIds['demo_admin'],
        ],
      );
      console.log(`  created article: ${artRows[0].id}`);
    } else {
      console.log('  skip article (already exists)');
    }

    // ── 6. Notifications ──────────────────────────────────────────────────────
    if (userIds['demo_pm']) {
      await qr.query(
        `INSERT INTO notifications
           ("recipientId", type, title, message, "isRead", "referenceType", "referenceId")
         VALUES ($1, 'REQUEST_APPROVED', 'Request Auto-Approved',
                 'Your demo purchase request has been automatically approved.', false,
                 'PurchaseRequest', $2)
         ON CONFLICT DO NOTHING`,
        [userIds['demo_pm'], prId],
      );
    }

    await qr.commitTransaction();
    console.log('\n✔ Demo seed complete.');
    console.log(`\nDemo credentials (password: ${DEMO_PASSWORD}):`);
    for (const u of USERS) {
      console.log(`  ${u.role.padEnd(25)} username: ${u.username}`);
    }
  } catch (err) {
    await qr.rollbackTransaction();
    console.error('Seed failed, rolled back:', err);
    process.exit(1);
  } finally {
    await qr.release();
    await DataSource.destroy();
  }
}

main();
