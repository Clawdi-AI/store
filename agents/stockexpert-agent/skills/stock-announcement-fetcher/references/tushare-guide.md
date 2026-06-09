# Tushare Pro 使用指南

## 什么是Tushare？

Tushare是国内最权威的开源金融数据接口，提供股票、基金、期货、债券等金融数据。

**官网：** https://tushare.pro

## 为什么选择Tushare？

### ✅ 优势

1. **数据权威**：来自上交所、深交所官方数据
2. **完全免费**：个人用户免费使用
3. **稳定可靠**：8年历史，百万用户
4. **数据全面**：公告、财报、行情、资金流等
5. **更新及时**：实时更新，延迟<5分钟

### ❌ 唯一缺点

- 需要注册获取token（但只需1分钟）

## 注册步骤

### 方法1：网页注册（推荐）

1. 访问 https://tushare.pro/register
2. 填写手机号/邮箱
3. 设置密码
4. 验证手机号
5. 登录后进入"用户中心" → "接口Token"
6. 复制token字符串（如：`a1b2c3d4e5f6...`）

### 方法2：微信快速注册

1. 访问 https://tushare.pro/register
2. 点击"微信登录"
3. 扫码授权
4. 自动生成账号和token

## 获取Token

登录后：
```
用户中心 → 接口Token → 复制
```

Token示例：
```
a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0
```

## 使用Token

### 命令行方式

```bash
uv run --script scripts/fetch_announcements_multi_source.py 000001.SZ --token YOUR_TOKEN
```

### 环境变量方式（推荐）

**Windows PowerShell：**
```powershell
$env:TUSHARE_TOKEN = "YOUR_TOKEN"
uv run --script scripts/fetch_announcements_multi_source.py 000001.SZ
```

**Linux/Mac：**
```bash
export TUSHARE_TOKEN="YOUR_TOKEN"
uv run --script scripts/fetch_announcements_multi_source.py 000001.SZ
```

## 免费额度

| 项目 | 免费额度 | 说明 |
|------|---------|------|
| 每分钟调用 | 120次 | 足够个人使用 |
| 每天调用 | 10000次 | 非常充足 |
| 积分要求 | 120分 | 注册即送120分 |
| 历史数据 | 无限 | 所有历史数据 |

## 常用接口

### 1. 公告数据

```python
import tushare as ts
ts.set_token('YOUR_TOKEN')
pro = ts.pro_api()

# 获取公告
df = pro.anns(
    ts_code='000001.SZ',
    start_date='20260201',
    end_date='20260228'
)
```

### 2. 财务数据

```python
# 业绩快报
df = pro.express(ts_code='000001.SZ', period='20251231')

# 业绩预告
df = pro.forecast(ts_code='000001.SZ', period='20251231')
```

### 3. 行情数据

```python
# 日线行情
df = pro.daily(ts_code='000001.SZ', start_date='20260201', end_date='20260228')

# 分钟行情（需400积分）
df = pro.min(ts_code='000001.SZ', start_date='20260228 09:30:00', end_date='20260228 15:00:00', freq='1min')
```

## 积分获取

### 免费获取积分方式

| 方式 | 积分 | 说明 |
|------|------|------|
| 注册账号 | +120 | 立即获得 |
| 每日签到 | +1 | 每天登录 |
| 分享推荐 | +100 | 邀请好友注册 |
| 社区贡献 | +50-500 | 发布教程、数据分析 |

### 积分用途

不同接口需要不同积分：

- 基础数据（行情、公告）：120分（免费）
- 财务数据：120-200分
- 高频数据（分钟线）：400分
- 因子数据：600分+

**重点：** 公告数据只需120分，注册即可用！

## 错误处理

### 常见错误

**1. 权限不足**
```
Error: 没有访问权限，请提升积分等级
```
解决：完成每日签到或邀请好友获取积分

**2. 超过频率限制**
```
Error: 超过调用频率限制
```
解决：等待1分钟后重试

**3. Token错误**
```
Error: 认证失败
```
解决：检查token是否正确复制

## 最佳实践

### 1. 缓存数据

历史公告不会变化，可以缓存：

```python
import pickle
from pathlib import Path

cache_file = Path(f"cache/{ts_code}_announcements.pkl")

if cache_file.exists():
    df = pickle.load(open(cache_file, 'rb'))
else:
    df = pro.anns(ts_code=ts_code, ...)
    pickle.dump(df, open(cache_file, 'wb'))
```

### 2. 批量查询

查询多只股票时，控制频率：

```python
import time

for code in stock_list:
    df = pro.anns(ts_code=code, ...)
    time.sleep(0.5)  # 避免超频
```

### 3. 异常重试

```python
from functools import wraps
import time

def retry(max_attempts=3, delay=1):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            for i in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if i == max_attempts - 1:
                        raise
                    time.sleep(delay)
        return wrapper
    return decorator

@retry(max_attempts=3)
def fetch_data(ts_code):
    return pro.anns(ts_code=ts_code, ...)
```

## 官方资源

- **官方文档：** https://tushare.pro/document/2
- **社区论坛：** https://waditu.com
- **GitHub：** https://github.com/waditu/tushare
- **公告接口：** https://tushare.pro/document/2?doc_id=97

## 常见问题

**Q: 个人使用需要付费吗？**
A: 不需要。免费版本足够个人投资者使用。

**Q: Token会过期吗？**
A: 不会。Token永久有效。

**Q: 数据准确吗？**
A: 来自交易所官方数据，准确性高。

**Q: 可以用于商业项目吗？**
A: 个人学习研究免费，商业使用需联系官方。

**Q: 如何提升积分？**
A: 每日签到、邀请好友、发布高质量内容。

---

**推荐：** 注册Tushare是使用本技能的最佳方式！
