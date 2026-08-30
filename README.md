# MT5 Copy Engine — High-Performance Cloud Copy Trading Platform

A modern, ultra-fast MT5 Copy Trading Platform with React, TypeScript, Supabase Realtime/Postgres, and production-grade MQL5 Expert Advisor.

---

## 🌟 Key Architecture & Capabilities

1. **Pure Copy Trading Engine (Zero Strategy Lag)**:
   - Designed strictly for instantaneous trade replication from Master to Slaves.
   - Master EA hooks into `OnTradeTransaction` and immediately broadcasts market buys/sells, pending orders, and volume adjustments.

2. **Real-time Stop Loss & Take Profit (SL/TP) Synchronization**:
   - When the Master trader sets or drags Stop Loss or Take Profit in MT5, all active Slave EAs synchronize the modification in real-time.

3. **Independent Risk Management Per Slave**:
   - Each Slave account can be configured independently:
     - **Lot Multiplier**: Scale Slave volume based on Master volume (e.g. `0.5x`, `1.0x`, `2.0x`).
     - **Fixed Lot**: Set a specific fixed lot size (e.g. `0.01`).
     - **Risk USD**: Calculate lot size based on Stop Loss distance and max dollar risk.
   - Per-account custom TP and partial exit controls.

4. **TCX Pro Dark Web Dashboard**:
   - **Single Account Dashboard**: Realtime EA online status, balance, equity, open P/L, spread, live positions table, and trade controls.
   - **Account Controller (Multi-Account Execution)**: Aggregate stats, multi-select account checkboxes, master buttons (ARM BUY, ARM SELL, AUTO ARM, CANCEL, BREAK EVEN, CLOSE ALL), and expandable account drawers with individual risk settings.
   - **Trade Monitor**: Auditable realtime stream of all copy events.
   - **Risk & Rules**: Safety parameters, slippage control, and emergency stop toggle.

5. **Auto Symbol Resolution**:
   - Slave EAs automatically handle broker symbol differences (e.g. `XAUUSD` vs `XAUUSD.m` vs `GOLD`).

---

## 🚀 Getting Started

### 1. Web Dashboard Setup

```bash
# Clone or open workspace
npm install
npm run build
npm run dev
```

Your `.env` file should have:
```env
VITE_SUPABASE_URL=https://drdfsvprjrewemhzkink.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_iguy_M7cSoea6vasam_zmg_CYjpgUNU
```

### 2. MetaTrader 5 EA Setup

1. Open MetaTrader 5.
2. Go to **Tools → Options → Expert Advisors**:
   - Enable **Allow WebRequest for listed URL**.
   - Add your Supabase project URL: `https://drdfsvprjrewemhzkink.supabase.co`
3. Copy [`mt5/CopyEngine/CopyEngine.mq5`](file:///Users/vedkanani/Desktop/smit_bhai/mt5/CopyEngine/CopyEngine.mq5) into your MT5 `MQL5/Experts` directory and compile in MetaEditor. Use the current CopyEngine v2.41 file; do not use the old reference EA.
4. On the Web Dashboard, create a **Master** or **Slave** connection and copy the single generated **InpAccountKey**. It has the form `account-uuid|secret-token`; treat it like a password.
5. Attach `CopyEngine` to your Master MT5 chart:
   - `InpRole`: `ROLE_MASTER`
   - `InpAccountKey`: Paste the complete `account-uuid|secret-token` value
6. Add your **Slave** accounts on the Web Dashboard:
   - Click **+ New EA** → Select **Slave**.
   - Attach `CopyEngine` to each Slave MT5 chart with `InpRole`: `ROLE_SLAVE`.
   - Set each slave’s risk settings in **Risk & Rules**. The EA receives and applies those settings per account.

The dashboard marks an EA online only while a recent heartbeat is present, the MT5 terminal is connected, and Algo Trading is enabled. Closing MT5, disabling Algo Trading, or losing the network causes the UI to show offline after the heartbeat lease expires.

---

## ⚡ Realtime Operations & Web Commands

- **Master Buys/Sells**: Automatically broadcast to all active Slaves in under 300ms.
- **Master Modifies SL/TP**: Instantly adjusts SL/TP on all corresponding Slave positions.
- **Master Closes / Partials**: Automatically closes or reduces position size on Slaves.
- **Web Dashboard Controls**: Send bulk or single commands (ARM BUY, ARM SELL, CANCEL, BREAK EVEN, CLOSE ALL) directly from any browser or mobile device.
