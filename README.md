# 江恩理论 A 股预测终端

一个基于 Node.js 的 Web 应用，用于抓取 A 股历史行情，并基于江恩理论中的价格分割、江恩角度线、时间周期窗口等方法生成分析结果，同时支持接入 OpenAI 兼容 LLM 接口输出研究报告。
<img width="326" height="411" alt="image" src="https://github.com/user-attachments/assets/df75e3e9-7361-4dce-b7ea-37bcac12b818" />


## 功能

- A 股日线、周线、月线历史行情加载
- 江恩主枢轴低点/高点识别
- 江恩扇形线（1x8、1x4、1x2、1x1、2x1、4x1）
- 江恩价格分割位
- 江恩时间窗口（7/9/21/30/45/60/90/120/144/180）
- 仿 TradingView 风格图表界面
- OpenAI 兼容 LLM 配置与 AI 报告输出
- SQLite 本地持久化
- 自选股管理
- AI 分析记录保存与回看

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

- 数据源使用东方财富公开 K 线接口。
- AI 报告基于当前行情和江恩分析结果生成，不会自动引入新闻或基本面数据。
- 预测结果与 AI 报告仅供研究与演示，不构成投资建议。
