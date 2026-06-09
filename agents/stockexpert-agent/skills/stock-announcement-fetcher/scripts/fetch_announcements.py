#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["akshare", "pandas", "requests"]
# ///
"""
Stock Announcement Fetcher
--------------------------
Fetches corporate announcements and regulatory filings.

Market routing (auto-detected from ticker format):
  - US stocks (AAPL, TSLA, NVDA)  -> SEC EDGAR
  - A-share (600519, 000001.SZ)   -> AkShare / Eastmoney
"""

import argparse
import re
import sys
from datetime import datetime, timedelta


# ---------------------------------------------------------------------------
# Market detection
# ---------------------------------------------------------------------------

def detect_market(ticker: str) -> str:
    """Return 'us', 'cn', or 'hk' based on ticker format."""
    ticker = ticker.strip().upper()
    if re.match(r"^\d{6}(\.SS|\.SZ)?$", ticker, re.IGNORECASE):
        return "cn"
    if ticker.endswith(".SS") or ticker.endswith(".SZ"):
        return "cn"
    if ticker.endswith(".HK") or re.match(r"^\d{4}\.HK$", ticker, re.IGNORECASE):
        return "hk"
    return "us"


def normalize_cn_code(ticker: str) -> str:
    """Strip .SS / .SZ suffix and return bare 6-digit code."""
    return re.sub(r"\.(SS|SZ)$", "", ticker.strip(), flags=re.IGNORECASE)


def trading_days(days: int) -> list[str]:
    """Return up to `days` recent weekday dates in YYYYMMDD format (newest first)."""
    result = []
    d = datetime.now().date()
    while len(result) < days:
        if d.weekday() < 5:   # Mon-Fri only
            result.append(d.strftime("%Y%m%d"))
        d -= timedelta(days=1)
        if len(result) >= days or (datetime.now().date() - d).days > days * 3:
            break
    return result


# ---------------------------------------------------------------------------
# US: SEC EDGAR
# ---------------------------------------------------------------------------

SEC_HEADERS = {
    "User-Agent": "StockExpertAgent contact@example.com",
    "Accept-Encoding": "gzip, deflate",
}

FILING_TYPE_LABELS = {
    "8-K":     "Material Event",
    "10-K":    "Annual Report",
    "10-Q":    "Quarterly Report",
    "S-1":     "IPO Registration",
    "DEF 14A": "Proxy Statement",
    "SC 13G":  "Large Shareholder (passive)",
    "SC 13D":  "Large Shareholder (active)",
    "4":       "Insider Transaction",
}


def get_cik(ticker: str) -> str | None:
    import requests
    resp = requests.get(
        "https://www.sec.gov/files/company_tickers.json",
        headers=SEC_HEADERS, timeout=10,
    )
    resp.raise_for_status()
    for entry in resp.json().values():
        if entry.get("ticker", "").upper() == ticker.upper():
            return str(entry["cik_str"]).zfill(10)
    return None


def fetch_sec_filings(ticker: str, days: int = 30, filing_type: str | None = None) -> list[dict]:
    import requests
    print(f"Fetching SEC EDGAR filings for {ticker}...", file=sys.stderr)
    cik = get_cik(ticker)
    if not cik:
        print(
            f"  WARNING: Could not resolve {ticker} to a CIK. "
            "Check ticker spelling or visit https://www.sec.gov/cgi-bin/browse-edgar",
            file=sys.stderr,
        )
        return []

    resp = requests.get(
        f"https://data.sec.gov/submissions/CIK{cik}.json",
        headers=SEC_HEADERS, timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    company_name = data.get("name", ticker)
    recent = data.get("filings", {}).get("recent", {})
    forms        = recent.get("form", [])
    filed_dates  = recent.get("filingDate", [])
    accessions   = recent.get("accessionNumber", [])
    descriptions = recent.get("primaryDocument", [])

    cutoff = datetime.now() - timedelta(days=days)
    results = []
    for form, date_str, accession, doc in zip(forms, filed_dates, accessions, descriptions):
        try:
            filed = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue
        if filed < cutoff:
            continue
        if filing_type and form.upper() != filing_type.upper():
            continue
        acc_clean = accession.replace("-", "")
        results.append({
            "date":    date_str,
            "type":    form,
            "label":   FILING_TYPE_LABELS.get(form, form),
            "title":   f"{form} — {FILING_TYPE_LABELS.get(form, 'SEC Filing')}",
            "url":     f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc_clean}/{doc}",
            "company": company_name,
        })
    return results


def print_sec_results(ticker: str, filings: list[dict]) -> None:
    sep = "=" * 80
    print(sep)
    company = filings[0]["company"] if filings else ticker
    print(f"SEC Filings: {company} ({ticker.upper()})")
    print(f"Source: SEC EDGAR  |  https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={ticker}")
    print(sep)
    if not filings:
        print("No filings found in the specified date range.")
        return
    for i, f in enumerate(filings, 1):
        print(f"\n[{i}] {f['date']}")
        print(f"    Type:  {f['type']} ({f['label']})")
        print(f"    Title: {f['title']}")
        print(f"    URL:   {f['url']}")
    print()


# ---------------------------------------------------------------------------
# A-share: AkShare / Eastmoney
# ---------------------------------------------------------------------------

def fetch_cn_announcements(ticker: str, days: int = 7, keyword: str | None = None) -> list[dict]:
    """
    Fetch A-share announcements via AkShare.
    Loops over recent trading days (Mon-Fri) up to `days` days back.
    Each day query takes ~10s; default is 7 trading days.
    """
    import akshare as ak
    import pandas as pd

    code = normalize_cn_code(ticker)
    dates = trading_days(min(days, 7))   # cap at 7 trading days to avoid timeout
    print(f"Fetching A-share announcements for {code} ({len(dates)} trading days)...", file=sys.stderr)

    all_results = []
    seen_titles = set()

    for date_str in dates:
        try:
            df = ak.stock_notice_report(symbol="全部", date=date_str)
        except Exception as e:
            print(f"  WARNING: Failed for {date_str}: {e}", file=sys.stderr)
            continue

        if df is None or df.empty:
            continue

        # Filter by stock code (column: 代码)
        df = df[df["代码"].astype(str).str.contains(code, na=False)]
        if df.empty:
            continue

        # Filter by keyword (column: 公告标题)
        if keyword:
            df = df[df["公告标题"].str.contains(keyword, na=False)]

        for _, row in df.iterrows():
            title = str(row.get("公告标题", ""))
            if title in seen_titles:
                continue
            seen_titles.add(title)
            date_val = row.get("公告日期", "")
            all_results.append({
                "date":  str(date_val)[:10] if date_val else date_str[:4] + "-" + date_str[4:6] + "-" + date_str[6:],
                "title": title,
                "type":  str(row.get("公告类型", "")),
                "url":   str(row.get("网址", "")),
            })

    return all_results


def print_cn_results(ticker: str, announcements: list[dict]) -> None:
    sep = "=" * 80
    print(sep)
    print(f"Announcements: {ticker}")
    print("Source: Eastmoney (AkShare)")
    print(sep)
    if not announcements:
        print("No announcements found in the specified date range.")
        return
    for i, a in enumerate(announcements, 1):
        print(f"\n[{i}] {a['date']}")
        print(f"    Title: {a['title']}")
        if a["type"]:
            print(f"    Type:  {a['type']}")
        if a["url"]:
            print(f"    URL:   {a['url']}")
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Fetch corporate announcements and SEC filings.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # US -- SEC EDGAR
  uv run --script fetch_announcements.py AAPL
  uv run --script fetch_announcements.py TSLA --days 7
  uv run --script fetch_announcements.py NVDA --type 10-Q

  # A-share -- Eastmoney (queries up to 7 recent trading days)
  uv run --script fetch_announcements.py 600519
  uv run --script fetch_announcements.py 000001.SZ --keyword merger
        """,
    )
    parser.add_argument("ticker", help="Stock ticker (e.g. AAPL, TSLA, 600519, 000001.SZ)")
    parser.add_argument("--days", type=int, default=7,
                        help="Look back N days (default: 7; A-share capped at 7 trading days)")
    parser.add_argument("--type", dest="filing_type", default=None,
                        help="US only: filing type filter (e.g. 8-K, 10-K, 10-Q)")
    parser.add_argument("--keyword", default=None,
                        help="A-share only: keyword filter for announcement titles")
    parser.add_argument("--format", dest="fmt", choices=["text", "json"], default="text",
                        help="Output format (default: text)")
    args = parser.parse_args()

    market = detect_market(args.ticker)

    if market == "hk":
        print(
            f"\nHK stocks ({args.ticker}) are not supported by this fetcher.\n"
            "For HK market news, use stock-info-explorer or check HKEX directly:\n"
            "  https://www.hkexnews.hk/",
            file=sys.stderr,
        )
        sys.exit(1)
    elif market == "us":
        results = fetch_sec_filings(args.ticker, days=args.days, filing_type=args.filing_type)
        if args.fmt == "json":
            import json
            print(json.dumps(results, indent=2, ensure_ascii=False))
        else:
            print_sec_results(args.ticker, results)
    else:
        results = fetch_cn_announcements(args.ticker, days=args.days, keyword=args.keyword)
        if args.fmt == "json":
            import json
            print(json.dumps(results, indent=2, ensure_ascii=False))
        else:
            print_cn_results(args.ticker, results)


if __name__ == "__main__":
    main()
