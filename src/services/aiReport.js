const DEFAULT_SYSTEM_PROMPT = [
  '你是资深A股研究员。',
  '你只能基于提供的行情数据和江恩理论分析结果输出结论，不要编造未提供的基本面、政策或新闻。',
  '报告必须使用中文，结构清晰，观点克制，必须包含风险提示，且明确说明不构成投资建议。'
].join(' ');

function normalizeBaseURL(baseURL) {
  return String(baseURL || '').trim().replace(/\/+$/, '');
}

function getDefaultLlmConfig() {
  return {
    baseURL: normalizeBaseURL(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
    apiKey: String(process.env.OPENAI_API_KEY || '').trim(),
    model: String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim(),
    temperature: Number(process.env.OPENAI_TEMPERATURE || 0.4),
    systemPrompt: String(process.env.OPENAI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT).trim()
  };
}

function buildPromptPayload(bundle) {
  const latest = bundle.history.candles[bundle.history.candles.length - 1];
  const recentCandles = bundle.history.candles.slice(-40).map((item) => ({
    date: item.date,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume,
    changePercent: item.changePercent
  }));

  return {
    security: {
      code: bundle.security.code,
      name: bundle.security.name,
      market: bundle.market
    },
    timeframe: {
      period: bundle.period,
      adjusted: bundle.adjusted,
      bars: bundle.history.candles.length,
      latestDate: latest.date,
      latestClose: latest.close
    },
    gann: {
      pivots: bundle.report.pivots,
      forecast: bundle.report.forecast,
      fanLines: bundle.report.fanLines,
      priceLevels: bundle.report.priceLevels,
      timeCycles: bundle.report.timeCycles,
      summary: bundle.report.summary
    },
    recentCandles
  };
}

function buildUserPrompt(bundle) {
  const payload = buildPromptPayload(bundle);

  return [
    '请根据以下 A 股行情和江恩理论结果，生成一份研究型分析报告。',
    '要求：',
    '1. 只基于提供的数据分析。',
    '2. 必须包含：趋势判断、关键支撑压力、时间窗口、可能情景推演、风险提示。',
    '3. 对江恩扇形线、价格分割位、时间周期要明确解释其含义。',
    '4. 输出格式使用 Markdown。',
    '5. 结论要区分短线和波段，不要写成绝对判断。',
    '',
    JSON.stringify(payload, null, 2)
  ].join('\n');
}

function extractMessageContent(content) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        if (item?.type === 'text') {
          return item.text || '';
        }
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

async function generateAiReport({ symbol, market, security, period, adjusted, history, report, llm }) {
  const defaults = getDefaultLlmConfig();
  const config = {
    baseURL: normalizeBaseURL(llm?.baseURL || defaults.baseURL),
    apiKey: String(llm?.apiKey || defaults.apiKey || '').trim(),
    model: String(llm?.model || defaults.model || '').trim(),
    temperature: Number.isFinite(Number(llm?.temperature)) ? Number(llm.temperature) : defaults.temperature,
    systemPrompt: String(llm?.systemPrompt || defaults.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim()
  };

  if (!config.baseURL) {
    throw new Error('缺少 LLM Base URL。');
  }

  if (!config.apiKey) {
    throw new Error('缺少 LLM API Key。');
  }

  if (!config.model) {
    throw new Error('缺少 LLM Model。');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);

  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        messages: [
          { role: 'system', content: config.systemPrompt },
          {
            role: 'user',
            content: buildUserPrompt({ symbol, market, security, period, adjusted, history, report })
          }
        ]
      }),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `LLM 接口请求失败，HTTP ${response.status}`;
      throw new Error(message);
    }

    if (!payload) {
      throw new Error('LLM 响应解析失败，可能是模型返回过慢或返回体不完整。');
    }

    const content = extractMessageContent(payload?.choices?.[0]?.message?.content);

    if (!content) {
      throw new Error('LLM 没有返回可用的报告内容。');
    }

    return {
      provider: config.baseURL,
      model: config.model,
      temperature: config.temperature,
      content,
      rawUsage: payload?.usage || null,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('LLM 请求超时，请稍后重试。');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  DEFAULT_SYSTEM_PROMPT,
  generateAiReport,
  getDefaultLlmConfig
};
