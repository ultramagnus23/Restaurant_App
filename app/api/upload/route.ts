import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';
import { parse } from 'csv-parse/sync';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // 1. Read the file content
    const buffer = Buffer.from(await file.arrayBuffer());
    const csvContent = buffer.toString('utf-8');

    // 2. Parse CSV
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      return NextResponse.json({ error: 'CSV is empty' }, { status: 400 });
    }

    // 3. Prepare Database Connection
    const dbPath = path.join(process.cwd(), 'restaurant_app.db');
    const db = new Database(dbPath);

    // 4. Generate Item IDs (The engines need numeric IDs for items)
    // We create a map of "Menu Item Name" -> "ID"
    const uniqueItems = [...new Set(records.map((r: any) => r.menu_item))];
    const itemMap = new Map();
    uniqueItems.forEach((name, index) => {
      itemMap.set(name, index + 1); // IDs start at 1
    });

    // 5. Insert Data Transactionally
    const insertQuery = db.prepare(`
      INSERT INTO transactions (
        pos_order_id, 
        timestamp, 
        channel, 
        menu_item, 
        category, 
        quantity, 
        price, 
        total_amount, 
        restaurant_id, 
        item_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        // Calculate derived fields
        const qty = parseInt(row.quantity);
        const price = parseFloat(row.price);
        const total = qty * price;
        const itemId = itemMap.get(row.menu_item);

        insertQuery.run(
          row.posOrderId,       // Map CSV 'posOrderId' -> DB 'pos_order_id'
          row.order_time,
          row.channel,
          row.menu_item,
          row.category,
          qty,
          price,
          total,                // Calculated total_amount
          1,                    // Default restaurant_id = 1
          itemId                // Generated item_id
        );
      }
    });

    insertMany(records);

    return NextResponse.json({ 
      success: true, 
      count: records.length,
      message: `Successfully processed ${records.length} transactions.` 
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to process CSV' }, { status: 500 });
  }
}