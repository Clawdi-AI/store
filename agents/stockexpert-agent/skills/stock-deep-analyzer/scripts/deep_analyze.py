#!/usr/bin/env python3
# /// script
# dependencies = ["yfinance", "pandas", "numpy"]
# ///

"""
Stock Deep Analyzer
Comprehensive stock analysis with value/growth/technical indicators
"""

import sys
import argparse
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime

def calculate_rsi(data, period=14):
    """Calculate RSI using Wilder's EMA smoothing (industry standard)"""
    delta = data.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1/period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1/period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss.replace(0, float('nan'))
    rsi = 100 - (100 / (1 + rs))
    return rsi

def calculate_macd(data, fast=12, slow=26, signal=9):
    """Calculate MACD indicator"""
    ema_fast = data.ewm(span=fast).mean()
    ema_slow = data.ewm(span=slow).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal).mean()
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram

def calculate_bollinger_bands(data, period=20, std_dev=2):
    """Calculate Bollinger Bands"""
    sma = data.rolling(window=period).mean()
    std = data.rolling(window=period).std()
    upper_band = sma + (std * std_dev)
    lower_band = sma - (std * std_dev)
    return upper_band, sma, lower_band

def analyze_stock(ticker, period='6mo'):
    """Comprehensive stock analysis"""
    
    print("=" * 60)
    print(f"Stock Deep Analysis Report: {ticker}")
    print("=" * 60)
    print()
    
    # Fetch stock data
    stock = yf.Ticker(ticker)
    info = stock.info
    hist = stock.history(period=period)
    
    if len(hist) == 0:
        print(f"Error: No data available for {ticker}")
        return None
    
    # ========== 1. Real-time Market Overview ==========
    print("[1] Real-time Market Overview")
    print("-" * 60)
    current_price = info.get('currentPrice', hist['Close'].iloc[-1])
    change = info.get('regularMarketChange', 0)
    change_pct = info.get('regularMarketChangePercent', 0)
    
    print(f"  Company: {info.get('longName', ticker)}")
    print(f"  Ticker: {ticker}")
    print(f"  Current Price: {current_price:.2f} {info.get('currency', 'USD')}")
    print(f"  Change: {change:+.2f} ({change_pct:+.2f}%)")
    print(f"  Volume: {info.get('volume', 0):,}")
    mcap = info.get('marketCap')
    if mcap:
        if mcap >= 1e12:
            mcap_str = f"{mcap/1e12:.2f}T"
        elif mcap >= 1e9:
            mcap_str = f"{mcap/1e9:.1f}B"
        else:
            mcap_str = f"{mcap/1e6:.0f}M"
        print(f"  Market Cap: {mcap_str}")
    else:
        print("  Market Cap: N/A")
    print(f"  52-Week Range: {info.get('fiftyTwoWeekLow', 'N/A')} - {info.get('fiftyTwoWeekHigh', 'N/A')}")
    print(f"  Beta: {info.get('beta', 'N/A')}")
    print()
    
    # ========== 2. Value Investing Indicators ==========
    print("[2] Value Investing Indicators")
    print("-" * 60)
    
    pe = info.get('trailingPE')
    pb = info.get('priceToBook')
    roe = info.get('returnOnEquity')
    roa = info.get('returnOnAssets')
    _div_rate = info.get('trailingAnnualDividendRate', 0)
    _price = info.get('currentPrice') or info.get('regularMarketPrice')
    div_yield = (_div_rate / _price * 100) if (_div_rate and _price) else None
    payout_ratio = info.get('payoutRatio')
    eps = info.get('trailingEps')
    book_value = info.get('bookValue')
    profit_margin = info.get('profitMargins')
    
    print(f"  P/E Ratio: {pe:.2f}" if pe else "  P/E: N/A (Loss-making)")
    print(f"  P/B Ratio: {pb:.2f}" if pb else "  P/B: N/A")
    print(f"  ROE: {roe*100:.2f}%" if roe else "  ROE: N/A")
    print(f"  ROA: {roa*100:.2f}%" if roa else "  ROA: N/A")
    print(f"  Profit Margin: {profit_margin*100:.2f}%" if profit_margin else "  Profit Margin: N/A")
    print(f"  Dividend Yield: {div_yield:.4f}%" if div_yield else "  Dividend Yield: N/A")
    print(f"  Payout Ratio: {payout_ratio*100:.2f}%" if payout_ratio else "  Payout Ratio: N/A")
    print(f"  EPS: {eps:.2f}" if eps else "  EPS: N/A")
    print(f"  Book Value: {book_value:.2f}" if book_value else "  Book Value: N/A")
    
    # Value Score
    value_score = 0
    if pe and pe < 15: value_score += 2
    if pb and pb < 3: value_score += 2
    if pb and pb < 1: value_score += 1  # Bonus for below book
    if roe and roe > 0.10: value_score += 2
    if div_yield and div_yield > 2.0: value_score += 2
    if profit_margin and profit_margin > 0.10: value_score += 1
    
    print(f"\n  Value Score: {value_score}/10")
    print()
    
    # ========== 3. Technical Analysis ==========
    print("[3] Technical Analysis")
    print("-" * 60)
    
    close_prices = hist['Close']
    
    # Moving Averages
    ma5 = close_prices.rolling(window=5).mean()
    ma20 = close_prices.rolling(window=20).mean()
    ma60 = close_prices.rolling(window=60).mean()
    
    # RSI
    rsi = calculate_rsi(close_prices)
    
    # MACD
    macd_line, signal_line, histogram = calculate_macd(close_prices)
    
    # Bollinger Bands
    upper_band, middle_band, lower_band = calculate_bollinger_bands(close_prices)
    
    # VWAP
    vwap = (hist['Volume'] * (hist['High'] + hist['Low'] + hist['Close']) / 3).cumsum() / hist['Volume'].cumsum()
    
    print(f"  Moving Averages:")
    print(f"    MA5:  {ma5.iloc[-1]:.2f}")
    print(f"    MA20: {ma20.iloc[-1]:.2f}")
    print(f"    MA60: {ma60.iloc[-1]:.2f}")
    print(f"  RSI(14): {rsi.iloc[-1]:.2f}")
    print(f"  MACD: {macd_line.iloc[-1]:.4f}")
    print(f"  Signal Line: {signal_line.iloc[-1]:.4f}")
    print(f"  Histogram: {histogram.iloc[-1]:.4f}")
    print(f"  Bollinger Bands:")
    print(f"    Upper: {upper_band.iloc[-1]:.2f}")
    print(f"    Middle: {middle_band.iloc[-1]:.2f}")
    print(f"    Lower: {lower_band.iloc[-1]:.2f}")
    bb_position = (current_price - lower_band.iloc[-1]) / (upper_band.iloc[-1] - lower_band.iloc[-1]) * 100
    print(f"    Position: {bb_position:.1f}%")
    print(f"  VWAP: {vwap.iloc[-1]:.2f}")
    
    # Technical Score
    tech_score = 0
    # Trend
    if current_price > ma5.iloc[-1] > ma20.iloc[-1]:
        tech_score += 2
    # RSI
    if 30 < rsi.iloc[-1] < 70:
        tech_score += 2
    elif rsi.iloc[-1] < 30:
        tech_score += 1  # Oversold, potential bounce
    # MACD
    if macd_line.iloc[-1] > signal_line.iloc[-1] and histogram.iloc[-1] > 0:
        tech_score += 2
    # Bollinger Bands
    if lower_band.iloc[-1] < current_price < upper_band.iloc[-1]:
        tech_score += 2
    # VWAP
    if current_price > vwap.iloc[-1]:
        tech_score += 2
    
    print(f"\n  Technical Score: {tech_score}/10")
    print()
    
    # ========== 4. Growth Indicators ==========
    print("[4] Growth Indicators")
    print("-" * 60)
    
    rev_growth = info.get('revenueGrowth')
    earn_growth = info.get('earningsGrowth')
    
    print(f"  Revenue Growth: {rev_growth*100:.2f}%" if rev_growth else "  Revenue Growth: N/A")
    print(f"  Earnings Growth: {earn_growth*100:.2f}%" if earn_growth else "  Earnings Growth: N/A")
    
    # Growth Score
    growth_score = 0
    if rev_growth and rev_growth > 0.05: growth_score += 2
    if rev_growth and rev_growth > 0.10: growth_score += 1
    if earn_growth and earn_growth > 0.10: growth_score += 3
    if earn_growth and earn_growth > 0.20: growth_score += 2
    if profit_margin and profit_margin > 0.15: growth_score += 2
    
    print(f"\n  Growth Score: {growth_score}/10")
    print()
    
    # ========== 5. Financial Health ==========
    print("[5] Financial Health")
    print("-" * 60)
    
    debt_to_equity = info.get('debtToEquity')
    current_ratio = info.get('currentRatio')
    
    print(f"  Debt-to-Equity: {debt_to_equity:.2f}" if debt_to_equity else "  Debt-to-Equity: N/A")
    print(f"  Current Ratio: {current_ratio:.2f}" if current_ratio else "  Current Ratio: N/A")
    
    # Financial Health Score
    financial_score = 5  # Base score
    if debt_to_equity and debt_to_equity < 1.0: financial_score += 2
    if current_ratio and current_ratio > 1.5: financial_score += 2
    if current_ratio and current_ratio > 2.0: financial_score += 1
    
    print(f"\n  Financial Health Score: {financial_score}/10")
    print()
    
    # ========== 6. Overall Rating ==========
    print("[6] Comprehensive Investment Rating")
    print("=" * 60)
    
    overall_score = (value_score * 0.35 + tech_score * 0.25 + growth_score * 0.25 + financial_score * 0.15)
    
    print(f"\n  Overall Score: {overall_score:.1f}/10")
    
    if overall_score >= 8:
        rating = "Strong Buy"
        stars = "⭐⭐⭐⭐⭐"
    elif overall_score >= 6.5:
        rating = "Buy"
        stars = "⭐⭐⭐⭐"
    elif overall_score >= 5:
        rating = "Hold"
        stars = "⭐⭐⭐"
    elif overall_score >= 3:
        rating = "Cautious"
        stars = "⭐⭐"
    else:
        rating = "Avoid"
        stars = "⭐"
    
    print(f"  Rating: {stars} {rating}")
    print()
    
    # ========== 7. Trading Strategies ==========
    print("[7] Recommended Trading Strategies")
    print("-" * 60)
    
    # Long-term hold strategy
    if value_score >= 7 and overall_score >= 6:
        target_price = book_value * 1.1 if book_value else current_price * 1.2
        print(f"  Long-term Hold: YES")
        print(f"    Position: 20-30%")
        print(f"    Target: {target_price:.2f}")
        print(f"    Holding Period: 1-3 years")
    else:
        print(f"  Long-term Hold: NOT RECOMMENDED")
    
    print()
    
    # Swing trade strategy
    if tech_score >= 5:
        buy_level = lower_band.iloc[-1]
        sell_level = upper_band.iloc[-1]
        print(f"  Swing Trade: Consider")
        print(f"    Buy Zone: {buy_level:.2f} - {middle_band.iloc[-1]:.2f}")
        print(f"    Sell Zone: {middle_band.iloc[-1]:.2f} - {sell_level:.2f}")
        print(f"    Stop Loss: {buy_level * 0.95:.2f}")
    else:
        print(f"  Swing Trade: Wait for better entry")
    
    print()
    
    # Short-term speculation
    if rsi.iloc[-1] < 30:
        print(f"  Short-term: Oversold bounce opportunity")
        print(f"    Entry: Current price")
        print(f"    Target: {current_price * 1.05:.2f} (+5%)")
        print(f"    Stop Loss: {current_price * 0.97:.2f} (-3%)")
    elif rsi.iloc[-1] > 70:
        print(f"  Short-term: Overbought, avoid chasing")
    else:
        print(f"  Short-term: No clear signal")
    
    print()
    
    # ========== 8. Risk Warnings ==========
    print("[8] Key Risk Warnings")
    print("-" * 60)
    
    risks = []
    
    if pe and pe > 30:
        risks.append("High valuation (P/E > 30)")
    if pb and pb > 5:
        risks.append("Overvalued vs book value (P/B > 5)")
    if roe and roe < 0:
        risks.append("Negative ROE - loss-making company")
    if rsi.iloc[-1] > 70:
        risks.append("Technical overbought (RSI > 70)")
    if current_price > upper_band.iloc[-1]:
        risks.append("Price above Bollinger upper band")
    if debt_to_equity and debt_to_equity > 2:
        risks.append("High debt-to-equity ratio (> 2.0)")
    if rev_growth and rev_growth < 0:
        risks.append("Negative revenue growth")
    
    if risks:
        for risk in risks:
            print(f"  - {risk}")
    else:
        print(f"  No major red flags identified")
    
    print()
    print("=" * 60)
    print(f"Report generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    return {
        'ticker': ticker,
        'overall_score': overall_score,
        'value_score': value_score,
        'tech_score': tech_score,
        'growth_score': growth_score,
        'financial_score': financial_score,
        'rating': rating,
        'current_price': current_price,
        'risks': risks
    }

def main():
    parser = argparse.ArgumentParser(description='Stock Deep Analyzer')
    parser.add_argument('ticker', help='Stock ticker symbol (e.g., 601288.SS, AAPL)')
    parser.add_argument('--period', default='6mo', help='Analysis period (1mo, 3mo, 6mo, 1y, 2y)')
    parser.add_argument('--output', default='text', choices=['text', 'json'], help='Output format')
    
    args = parser.parse_args()
    
    result = analyze_stock(args.ticker, args.period)
    
    if args.output == 'json' and result:
        import json
        print(json.dumps(result, indent=2))

if __name__ == '__main__':
    main()
