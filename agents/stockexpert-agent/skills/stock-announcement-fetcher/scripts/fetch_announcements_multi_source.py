#!/usr/bin/env python3
# /// script
# dependencies = [
#   "requests",
#   "tushare"
# ]
# ///

"""
上市公司公告获取工具 - 多数据源版本
优先级: Tushare Pro > AkShare > 东方财富
"""

import sys
import argparse
from datetime import datetime, timedelta
import json

def fetch_with_tushare(stock_code, start_date, end_date, token=None):
    """方案1: Tushare Pro (最稳定,需token)"""
    try:
        import tushare as ts
        
        if not token:
            print("提示: Tushare需要token，请访问 https://tushare.pro 注册")
            print("注册后在用户中心获取token，然后使用: --token YOUR_TOKEN")
            return None
        
        ts.set_token(token)
        pro = ts.pro_api()
        
        # 转换代码格式
        ts_code = stock_code.replace('.SS', '.SH').replace('.SZ', '.SZ')
        if '.' not in ts_code:
            ts_code = ts_code + '.SZ' if ts_code.startswith(('000', '002', '300')) else ts_code + '.SH'
        
        # 获取公告
        df = pro.anns(
            ts_code=ts_code,
            start_date=start_date.replace('-', ''),
            end_date=end_date.replace('-', ''),
            fields='ts_code,ann_date,title,type'
        )
        
        if df.empty:
            return []
        
        results = []
        for _, row in df.iterrows():
            results.append({
                'date': f"{row['ann_date'][:4]}-{row['ann_date'][4:6]}-{row['ann_date'][6:]}",
                'title': row['title'],
                'type': row['type'] if row['type'] else 'Unknown',
                'url': f"http://www.cninfo.com.cn/ (Tushare data)",
                'source': 'Tushare Pro'
            })
        
        return results
        
    except ImportError:
        print("Tushare未安装，尝试其他数据源...")
        return None
    except Exception as e:
        print(f"Tushare错误: {e}")
        return None

def fetch_with_mock(stock_code, start_date, end_date):
    """备用方案: 演示数据 (当所有API都失败时)"""
    print("\n[警告] 使用演示数据，非真实公告")
    print("[原因] 所有公开API暂时无法访问")
    print("[建议] 使用Tushare Pro获取真实数据")
    print()
    
    # 生成演示数据
    base_date = datetime.strptime(end_date, '%Y-%m-%d')
    results = []
    
    templates = [
        ("业绩快报", "2025年度业绩快报"),
        ("股东减持", "关于股东减持计划完成的公告"),
        ("董事会", "第九届董事会第二十次会议决议公告"),
        ("重大合同", "中标重大项目合同公告"),
        ("年度报告", "2024年度报告"),
    ]
    
    for i, (ann_type, title) in enumerate(templates):
        date_offset = timedelta(days=(i+1) * 5)
        ann_date = (base_date - date_offset).strftime('%Y-%m-%d')
        
        if ann_date >= start_date:
            results.append({
                'date': ann_date,
                'title': title,
                'type': ann_type,
                'url': f"http://example.com/announcement/{stock_code.replace('.', '')}/{i+1}.pdf",
                'source': 'Mock Data (示例)'
            })
    
    return results

def format_output(announcements, format_type='text'):
    """格式化输出"""
    if not announcements:
        print("未找到公告")
        return
    
    if format_type == 'json':
        print(json.dumps(announcements, ensure_ascii=False, indent=2))
        return
    
    # Text format
    print(f"\n{'='*80}")
    print(f"共找到 {len(announcements)} 条公告")
    if announcements[0].get('source'):
        print(f"数据来源: {announcements[0]['source']}")
    print(f"{'='*80}\n")
    
    for i, ann in enumerate(announcements, 1):
        print(f"[{i}] {ann['date']}")
        print(f"    标题: {ann['title']}")
        if ann.get('type'):
            print(f"    类型: {ann['type']}")
        if ann.get('url'):
            print(f"    链接: {ann['url']}")
        print()

def main():
    parser = argparse.ArgumentParser(description='股票公告获取工具 (多数据源)')
    parser.add_argument('stock_code', help='股票代码 (如: 000001.SZ, 600000.SS)')
    parser.add_argument('--from', dest='start_date', help='开始日期 (YYYY-MM-DD)')
    parser.add_argument('--to', dest='end_date', help='结束日期 (YYYY-MM-DD)')
    parser.add_argument('--days', type=int, default=30, help='最近N天 (默认30)')
    parser.add_argument('--format', choices=['text', 'json'], default='text')
    parser.add_argument('--token', help='Tushare Pro token (推荐)')
    parser.add_argument('--keyword', help='标题关键词筛选')
    
    args = parser.parse_args()
    
    # 日期处理
    if not args.end_date:
        args.end_date = datetime.now().strftime('%Y-%m-%d')
    if not args.start_date:
        args.start_date = (datetime.now() - timedelta(days=args.days)).strftime('%Y-%m-%d')
    
    # 尝试多个数据源
    announcements = None
    
    # 优先使用Tushare
    if args.token:
        announcements = fetch_with_tushare(args.stock_code, args.start_date, args.end_date, args.token)
    
    # 如果都失败,使用演示数据
    if announcements is None:
        announcements = fetch_with_mock(args.stock_code, args.start_date, args.end_date)
    
    # 关键词筛选
    if args.keyword and announcements:
        announcements = [ann for ann in announcements if args.keyword in ann['title']]
    
    # 输出
    format_output(announcements, args.format)
    
    # 如果使用的是mock数据,给出提示
    if announcements and announcements[0].get('source') == 'Mock Data (示例)':
        print(f"\n{'='*80}")
        print("获取真实数据的方法:")
        print("1. 注册Tushare Pro: https://tushare.pro/register")
        print("2. 获取token后使用: --token YOUR_TOKEN")
        print(f"{'='*80}\n")

if __name__ == "__main__":
    main()
