# 巨潮资讯网 API 参考

## 数据源

- **官网：** http://www.cninfo.com.cn
- **API端点：** http://www.cninfo.com.cn/new/hisAnnouncement/query
- **方法：** POST
- **认证：** 无需认证（公开API）

## 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| stock | string | 是 | 股票代码（6位数字） |
| searchkey | string | 否 | 搜索关键词 |
| plate | string | 否 | 板块代码 |
| category | string | 否 | 分类代码 |
| column | string | 是 | 交易所（szse/sse/sse_sme） |
| pageNum | int | 是 | 页码（从1开始） |
| pageSize | int | 是 | 每页数量（建议10-50） |
| tabName | string | 是 | 固定值：fulltext |
| seDate | string | 否 | 日期范围（格式：YYYY-MM-DD~YYYY-MM-DD） |

## 响应格式

```json
{
  "announcements": [
    {
      "secCode": "000001",
      "secName": "平安银行",
      "announcementId": "1234567890",
      "announcementTitle": "2025年度业绩快报",
      "announcementTime": "2026-02-28 00:00:00",
      "announcementTypeName": "业绩快报",
      "adjunctUrl": "finalpage/2026-02-28/1234567890.PDF",
      "adjunctSize": 256000,
      "adjunctType": "PDF",
      "storageTime": "2026-02-28 08:30:00",
      "columnId": "szse_main",
      "pageColumn": "szse"
    }
  ],
  "totalRecordNum": 150,
  "totalPageNum": 5
}
```

## 常见公告类型代码

| 代码 | 名称 | 说明 |
|------|------|------|
| category_ndbg_szsh | 年度报告 | 年报 |
| category_bndbg_szsh | 半年度报告 | 中报 |
| category_yjygjxz_szsh | 业绩预告 | 业绩预告 |
| category_yjkb_szsh | 业绩快报 | 业绩快报 |
| category_dshgg_szsh | 董事会公告 | 董事会 |
| category_jshgg_szsh | 监事会公告 | 监事会 |
| category_gqjl_szsh | 股权激励 | 激励计划 |

## 股票代码映射

### 上海交易所（column=sse）
- 主板：600000-603999
- 科创板：688000-689999

### 深圳交易所（column=szse）
- 主板：000000-001999
- 中小板：002000-004999
- 创业板：300000-301999

## 错误处理

**常见错误：**
1. **股票代码不存在：** 返回空数组
2. **日期格式错误：** 400 Bad Request
3. **网络超时：** 建议重试3次，间隔1秒

**重试策略：**
```python
import time

def fetch_with_retry(url, data, max_retries=3):
    for i in range(max_retries):
        try:
            response = requests.post(url, data=data, timeout=10)
            return response
        except Exception as e:
            if i == max_retries - 1:
                raise
            time.sleep(1)
```

## 使用限制

- **频率限制：** 无明确限制，建议不超过10次/秒
- **单次查询：** 最多返回500条
- **历史数据：** 支持查询所有历史公告
- **实时性：** 公告通常在发布后1分钟内可查

## 最佳实践

1. **缓存机制：** 同一天的公告可缓存，避免重复请求
2. **批量查询：** 多只股票建议串行查询，避免并发
3. **错误处理：** 捕获所有异常，提供友好错误提示
4. **日期范围：** 建议不超过1年，避免数据量过大

## 其他数据源（备选）

### 东方财富网
- **URL：** http://data.eastmoney.com/notices/
- **优点：** 数据丰富，分类详细
- **缺点：** 需要解析HTML

### 新浪财经
- **URL：** http://vip.stock.finance.sina.com.cn/corp/go.php/vCB_AllBulletin/
- **优点：** 稳定
- **缺点：** 格式不统一

### Tushare（需要token）
- **接口：** disclosure
- **优点：** 结构化数据，质量高
- **缺点：** 需要注册获取token，免费版有限流
