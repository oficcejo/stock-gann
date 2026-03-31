# 江恩理论 A 股预测终端

一个基于 Node.js 的 Web 应用，用于抓取 A 股历史行情，并基于江恩理论中的价格分割、江恩角度线、时间周期窗口等方法生成分析结果，同时支持接入 OpenAI 兼容 LLM 接口输出研究报告。

## 功能

- A 股日线、周线、月线历史行情加载
- 双行情源自动回退
- 江恩主枢轴低点/高点识别
- 江恩扇形线（1x8、1x4、1x2、1x1、2x1、4x1）
- 江恩价格分割位
- 江恩时间窗口（7/9/21/30/45/60/90/120/144/180）
- 仿 TradingView 风格图表界面
- 图表画线、水平线、未来留白分析区
- OpenAI 兼容 LLM 配置与 AI 报告输出
- SQLite 本地持久化
- 自选股管理
- AI 分析记录保存与回看

## 运行要求

- Node.js `>=22`

说明：项目使用了 Node 内置的 `node:sqlite` 作为 SQLite 驱动，因此不再依赖额外原生数据库包。

## 启动

```bash
npm.cmd install --cache .npm-cache
npm.cmd start
```

启动后打开 `http://localhost:3000`。

## 可选环境变量

```bash
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=your_api_key
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.4
OPENAI_SYSTEM_PROMPT=你是资深A股研究员...
```

说明：
- 页面右侧 AI 配置会优先读取浏览器本地保存的参数。
- 如果本地未保存，会读取服务端环境变量作为默认值。
- 页面输入的 API Key 仅保存在浏览器本地，不会写回服务端文件。
- 本地数据库默认写入 `data/gann-app.sqlite`。

## 行情数据源

系统默认优先使用东方财富 K 线接口：

- `https://push2his.eastmoney.com/api/qt/stock/kline/get`

如果东方财富接口出现限流、报错或无可用数据，会自动回退到备用行情源：

- `http://43.138.33.77:8080`
- 项目说明：`https://github.com/oficcejo/tdx-api`

当前实现说明：
- 主源失败时，服务端会自动切换到 `tdx-api`，前端无须额外处理。
- 备用源使用 `/api/kline` 提取 K 线数据。
- 备用源价格单位已在服务端换算为正常元价格。
- 备用源返回的历史顺序已在服务端按时间升序统一处理，以保证图表和分析逻辑一致。

## 接口

- `GET /api/history/:symbol`
- `GET /api/analyze/:symbol`
- `GET /api/llm/defaults`
- `POST /api/ai-report`
- `GET /api/watchlist`
- `POST /api/watchlist`
- `DELETE /api/watchlist/:symbol`
- `GET /api/ai-reports`
- `GET /api/ai-reports/:id`

`POST /api/ai-report` 请求体示例：

```json
{
  "symbol": "600519",
  "period": "daily",
  "adjusted": "forward",
  "limit": 320,
  "llm": {
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "sk-...",
    "model": "gpt-4o-mini",
    "temperature": 0.4,
    "systemPrompt": "你是资深A股研究员..."
  }
}
```

## 说明

- 数据源默认使用东方财富公开 K 线接口，异常时自动切换到 `tdx-api` 备用源。
- AI 报告基于当前行情和江恩分析结果生成，不会自动引入新闻或基本面数据。
- 自选股与 AI 历史记录会持久化保存到本地 SQLite 数据库。
- 预测结果与 AI 报告仅供研究与演示，不构成投资建议。
