# Restaurant Intelligence Platform

A comprehensive restaurant analytics and decision-support system that transforms POS transaction data into profit-aware operational decisions.

## Features

- **Decision Engine**: Prioritized recommendations with impact analysis
- **Menu Engineering**: Stars/Plowhorses/Puzzles/Dogs classification with margin analysis
- **Capacity Optimization**: RevPASH analysis and bottleneck identification
- **Channel Performance**: Multi-channel profitability and LTV:CAC analysis
- **Server Performance**: Normalized effectiveness scores with fatigue tracking
- **Scenario Simulator**: What-if modeling for operational changes
- **Multi-Currency Support**: Base currency in INR, convertible to USD, EUR, GBP, AUD, CAD, SGD, AED

## Getting Started

1. Install dependencies (handled automatically by v0)
2. Configure your POS API integration in `app/api/orders/route.ts`
3. Update database connections for menu, servers, and other data
4. Customize currency rates in `lib/currency.ts` if needed

## API Integration

### Connecting Your POS System

Edit `app/api/orders/route.ts` and replace the mock data with your actual POS API:

```typescript
// Example: Square POS Integration
import { SquareClient } from '@square/api-client'

const client = new SquareClient({
  accessToken: process.env.SQUARE_API_KEY
})

const orders = await client.orders.list({
  locationIds: [process.env.LOCATION_ID],
  // ... other params
})
```

### Supported POS Systems

This platform can integrate with any POS system that provides:
- Order transaction data (timestamp, items, amounts, channel)
- Menu item information (name, price, cost, prep time)
- Server/staff performance data
- Customer information (optional, for repeat behavior tracking)

Popular integrations: Square, Toast, Lightspeed, Clover, TouchBistro, Revel, Upserve

## Data Models

All data types are defined in `lib/types.ts`:
- `Order`: Transaction records from POS
- `MenuItem`: Menu items with costs and pricing
- `Server`: Staff performance metrics
- `ChannelMetrics`: Sales channel profitability
- `Decision`: AI-generated recommendations
- `Scenario`: What-if simulation results

## Architecture

- **Frontend**: Next.js 16 with React 19, Tailwind CSS, shadcn/ui
- **State Management**: Zustand for global state (currency, decisions)
- **Data Fetching**: API routes with client-side caching
- **Currency**: Base INR with real-time conversion
- **Charts**: Recharts for data visualization

## Customization

### Adding New Currencies

Edit `lib/currency.ts`:

```typescript
export const CURRENCY_RATES: Record<Currency, CurrencyRate> = {
  // Add your currency
  JPY: { code: "JPY", symbol: "¥", rate: 1.8, name: "Japanese Yen" },
}
```

### Adding New Metrics

1. Define types in `lib/types.ts`
2. Create API route in `app/api/analytics/[metric]/route.ts`
3. Add to `lib/api-client.ts`
4. Create component in `components/[metric].tsx`
5. Add tab to `app/page.tsx`

## Environment Variables

Create these in your Vercel project settings:

```
# POS API
POS_API_KEY=your_pos_api_key
POS_LOCATION_ID=your_location_id

# Database (optional)
DATABASE_URL=your_database_url

# Other integrations
SQUARE_API_KEY=...
TOAST_API_KEY=...
```

## Logic & Calculations

### Menu Engineering
- **Stars**: Popularity > 50 AND Margin > ₹680
- **Plowhorses**: Popularity > 50 AND Margin < ₹680
- **Puzzles**: Popularity < 50 AND Margin > ₹680
- **Dogs**: Popularity < 50 AND Margin < ₹680

### RevPASH (Revenue Per Available Seat Hour)
- Formula: `Total Revenue / (Total Seats × Hours Open)`

### Server Effectiveness
- Normalized for shift difficulty and fatigue
- Formula: `(Raw Performance / Shift Difficulty) × Fatigue Adjustment`

### Channel Profitability
- Net Margin = Gross Margin - Platform Fees - CAC
- LTV:CAC Ratio = Customer Lifetime Value / Customer Acquisition Cost

## Support

For issues or questions, refer to the inline code comments marked with `// TODO:` for integration points.
