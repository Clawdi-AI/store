# 升级指南 - 从演示版到生产版

当前版本是**演示版**，返回模拟数据。要获取真实公告数据，有以下几种方案：

## 方案一：Tushare Pro API（推荐）⭐

### 优点
- ✅ 数据质量高、结构化
- ✅ 覆盖全面（A股、港股、基金等）
- ✅ 官方维护，稳定可靠
- ✅ 免费版每天500次调用

### 申请步骤

1. **注册账号**
   - 访问：https://tushare.pro/register
   - 填写邮箱完成注册

2. **实名认证**
   - 登录后进入"个人中心"
   - 完成实名认证（需手机号）

3. **获取Token**
   - 实名后自动获得token
   - 复制保存到安全位置

### 集成代码示例

```python
import tushare as ts

# 设置token
ts.set_token('YOUR_TOKEN_HERE')
pro = ts.pro_api()

# 获取公告
df = pro.anns(
    ts_code='000001.SZ',  # 股票代码
    start_date='20260201',  # 开始日期
    end_date='20260228',    # 结束日期
    ann_type='1'  # 1=年报 2=中报 3=一季报 4=三季报
)

print(df)
```

### 替换步骤

1. 安装依赖：`uv add tushare`
2. 修改 `scripts/fetch_announcements.py`
3. 将演示数据部分替换为Tushare调用
4. 设置环境变量：`TUSHARE_TOKEN=your_token`

---

##方案二：爬虫方案（不推荐）

### 可用数据源

1. **巨潮资讯网**
   - URL: http://www.cninfo.com.cn
   - 问题：API不稳定，需要破解反爬

2. **东方财富网**
   - URL: https://data.eastmoney.com/notices/
   - 问题：页面结构经常变化

3. **新浪财经**
   - URL: http://vip.stock.finance.sina.com.cn
   - 问题：数据不全

### 爬虫风险

- ⚠️ IP可能被封
- ⚠️ 需要处理验证码
- ⚠️ 数据格式不稳定
- ⚠️ 违反网站服务条款

**不建议用于生产环境！**

---

## 方案三：付费数据服务

### Wind API
- **费用：** 约10万元/年
- **适合：** 机构用户

### 万得Choice API
- **费用：** 约5万元/年
- **适合：** 专业投资者

---

## 推荐配置（Tushare Pro）

### Step 1：修改脚本

将 `fetch_announcements.py` 中的 `fetch_demo_announcements` 函数替换为：

```python
def fetch_a_stock_announcements(self, stock_code, start_date=None, end_date=None, page_size=30):
    import tushare as ts
    import os
    
    # 从环境变量读取token
    token = os.getenv('TUSHARE_TOKEN')
    if not token:
        print("Error: TUSHARE_TOKEN environment variable not set", file=sys.stderr)
        return []
    
    ts.set_token(token)
    pro = ts.pro_api()
    
    # 转换日期格式
    start_date_ts = start_date.replace('-', '') if start_date else None
    end_date_ts = end_date.replace('-', '') if end_date else None
    
    # 转换股票代码
    ts_code = stock_code.replace('.SS', '.SH')  # Yahoo格式转Tushare格式
    
    try:
        # 调用API
        df = pro.anns(
            ts_code=ts_code,
            start_date=start_date_ts,
            end_date=end_date_ts,
            limit=page_size
        )
        
        # 转换为标准格式
        results = []
        for _, row in df.iterrows():
            results.append({
                'date': row['ann_date'],
                'title': row['title'],
                'type': row['ann_type'],
                'url': row['ann_url'] if 'ann_url' in row else '',
                'code': row['ts_code'],
                'stock_name': row['name'] if 'name' in row else ''
            })
        
        return results
    
    except Exception as e:
        print(f"Error fetching from Tushare: {e}", file=sys.stderr)
        return []
```

### Step 2：设置环境变量

**Windows PowerShell:**
```powershell
$env:TUSHARE_TOKEN = "your_token_here"
```

**永久设置:**
1. 打开"系统属性" → "环境变量"
2. 新建用户变量：`TUSHARE_TOKEN`
3. 值填入您的token

### Step 3：测试

```bash
uv run --script scripts/fetch_announcements.py 000001.SZ --days 7
```

---

## 常见问题

**Q: Tushare免费版够用吗？**
A: 每天500次调用，个人用户完全够用。

**Q: 如何提高调用次数？**
A: 完成实名认证后，积分会逐步增加，调用次数也会增加。

**Q: 演示版可以用于学习吗？**
A: 可以！演示版展示了完整的技能结构和工作流程。

**Q: 不想用Tushare怎么办？**
A: 可以保持演示版用于流程展示，或自行集成其他数据源。

---

## 联系支持

如需帮助升级到生产版本，请提供：
1. 您的使用场景
2. 预算范围
3. 数据需求（A股/港股/频率等）

芝士小弟随时待命！🧀
