# Supported CSV Formats

## US & International Brokers

---

### Interactive Brokers (IBKR) — `ibkr`

**How to export**: Account Management → Reports → Activity → Trades section  
**Encoding**: UTF-8  
**Delimiter**: Comma

| Field | Description | Example |
|-------|-------------|---------|
| Symbol | Ticker symbol | AAPL |
| Date/Time | Trade date and time | 2024-01-15, 09:30:00 |
| Quantity | Shares (positive = buy, negative = sell) | 100 / -100 |
| T. Price | Trade price | 185.50 |
| Comm/Fee | Commission | 1.00 |
| Asset Category | Instrument type | STK / OPT |
| Currency | Trade currency | USD |

---

### Charles Schwab — `schwab`

**How to export**: Accounts → History → Export  
**Encoding**: UTF-8  
**Delimiter**: Comma

| Field | Description | Example |
|-------|-------------|---------|
| Date | Trade date | 01/15/2024 |
| Action | Buy/Sell | Buy / Sell |
| Symbol | Ticker | TSLA |
| Quantity | Shares | 50 |
| Price | Fill price | 220.30 |
| Fees & Comm | Commission | 0.00 |
| Amount | Total amount | 11015.00 |

---

### TD Ameritrade / thinkorswim — `tdameritrade`

**How to export**: My Account → History & Statements → Export  
**Encoding**: UTF-8  
**Delimiter**: Comma

| Field | Description | Example |
|-------|-------------|---------|
| DATE | Trade date | 01/15/2024 |
| TRANSACTION ID | Unique ID | 12345678 |
| DESCRIPTION | Trade description | Bought 100 NVDA @ 495.00 |
| QUANTITY | Shares | 100 |
| SYMBOL | Ticker | NVDA |
| PRICE | Fill price | 495.00 |
| COMMISSION | Commission | 0.00 |
| AMOUNT | Net amount | -49500.00 |
| REG FEE | Regulatory fee | 0.01 |

---

### Robinhood — `robinhood`

**How to export**: Account → Statements → Download CSV  
**Encoding**: UTF-8  
**Delimiter**: Comma

| Field | Description | Example |
|-------|-------------|---------|
| Activity Date | Trade date | 01/15/2024 |
| Process Date | Settlement date | 01/17/2024 |
| Settle Date | Settlement date | 01/17/2024 |
| Instrument | Ticker | AAPL |
| Description | Trade description | Buy 10 AAPL |
| Trans Code | Transaction type | Buy / Sell |
| Quantity | Shares | 10 |
| Price | Fill price | 185.50 |
| Amount | Net amount | -1855.00 |

---

### Webull — `webull`

**How to export**: Orders → History → Export  
**Encoding**: UTF-8  
**Delimiter**: Comma

| Field | Description | Example |
|-------|-------------|---------|
| Time | Trade date/time | 2024-01-15 09:30:00 |
| Symbol | Ticker | MSFT |
| Side | Buy/Sell | BUY / SELL |
| Filled Qty | Shares | 25 |
| Avg Price | Average fill price | 375.20 |
| Filled Amount | Total amount | 9380.00 |
| Status | Order status | Filled |

---

## Asian Brokers

---

### Futu / Moomoo (English) — `futu_en`

**Encoding**: UTF-8  
**Delimiter**: Comma

| Field | Description | Example |
|-------|-------------|---------|
| Side | Trade direction | Buy / Sell / Short Sell / Buy to Cover |
| Symbol | Stock code | AAPL |
| Fill Price | Fill price | 150.50 |
| Fill Qty | Fill quantity | 100 |
| Fill Time | Fill time | 2024/01/15 09:30:00 |
| Market | Market type | US / HK / CN |
| Status | Order status | Filled / Partially Filled |

---

### Futu / Moomoo (Chinese) — `futu_cn`

**Encoding**: UTF-8-BOM  
**Delimiter**: Comma

| Field | Description | Example |
|-------|-------------|---------|
| 方向 | Trade direction | 买入 / 卖出 |
| 代码 | Stock code | AAPL |
| 成交价格 | Fill price | 150.50 |
| 成交数量 | Fill quantity | 100 |
| 成交时间 | Fill time | 2024/01/15 09:30:00 |
| 市场 | Market | 美股 / 港股 / 沪深 |

---

### Tiger Brokers — `tiger_cn`

**Encoding**: UTF-8  
**Delimiter**: Comma

| Field | Description | Example |
|-------|-------------|---------|
| 交易方向 | Trade direction | 买入 / 卖出 |
| 股票代码 | Stock code | AAPL |
| 成交均价 | Fill price | 150.50 |
| 成交数量 | Fill quantity | 100 |
| 成交时间 | Fill time | 2024-01-15 09:30:00 |
| 币种 | Currency | USD / HKD / CNY |
| 手续费 | Commission | 0.99 |

---

---

### CITIC Securities — `citic_cn`

**How to export**: Trading client → Account → Trade History → Export  
**Encoding**: GBK  
**Delimiter**: Comma

| Field | Description | Example |
|-------|-------------|---------|
| 委托方向 | Trade direction | 买入 / 卖出 |
| 证券代码 | Stock code (A-share) | 600519 |
| 证券名称 | Company name | 贵州茅台 |
| 成交价格 | Fill price | 1680.00 |
| 成交数量 | Shares filled | 100 |
| 成交金额 | Total amount | 168000.00 |
| 成交时间 | Fill time | 2024-01-15 09:30:00 |
| 手续费 | Commission | 5.04 |
| 过户费 | Transfer fee | 0.34 |
| 印花税 | Stamp duty | 168.00 |
| 席位代码 | Branch code | 0010 |

---

### Huatai Securities — `huatai_cn`

**How to export**: Huatai client → Account → Trade Records → Export  
**Encoding**: GBK  
**Delimiter**: Comma

| Field | Description | Example |
|-------|-------------|---------|
| 买卖方向 | Trade direction | 买入 / 卖出  (or 1 / 2) |
| 证券代码 | Stock code (A-share) | 000001 |
| 证券名称 | Company name | 平安银行 |
| 成交价格 | Fill price | 12.50 |
| 成交数量 | Shares filled | 1000 |
| 成交金额 | Total amount | 12500.00 |
| 成交时间 | Fill time | 2024-01-15 09:30:00 |
| 佣金 | Commission | 3.75 |
| 过户费 | Transfer fee | 0.13 |
| 经手费 | Exchange handling fee | 0.50 |
| 证管费 | CSRC regulatory fee | 0.13 |

## Standard Internal Fields

After import, all formats are normalized to these standard fields:

| Field | Description | Required |
|-------|-------------|---------|
| `symbol` | Stock ticker | ✅ |
| `symbol_name` | Company name | |
| `direction` | `buy` / `sell` / `sell_short` / `buy_to_cover` | ✅ |
| `filled_price` | Fill price | ✅ |
| `filled_quantity` | Number of shares | ✅ |
| `filled_amount` | Total value | |
| `filled_time` | Fill timestamp | ✅ |
| `market` | `us` / `hk` / `cn` | |
| `currency` | Trade currency | |
| `status` | `filled` / `cancelled` | |
| `total_fee` | Total fees/commissions | |
| `commission` | Broker commission | |

---

## Adding a New Broker

Add a new entry to `BROKER_CONFIGS` in `scripts/import_trades.py`:

```python
"new_broker": {
    "name": "Broker Name",
    "encoding": "utf-8",
    "detect_columns": ["unique_column_1", "unique_column_2"],
    "field_map": {
        "Date": "filled_time",
        "Action": "direction",
        "Symbol": "symbol",
        "Quantity": "filled_quantity",
        "Price": "filled_price",
        "Amount": "filled_amount",
        "Commission": "commission",
    },
    "direction_map": {"Buy": "buy", "Sell": "sell"},
    "status_map": {"Filled": "filled"},
}
```
