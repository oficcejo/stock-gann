const express = require('express');
const path = require('path');
const { fetchAStockHistory, normalizeSymbol, resolveMarket } = require('./src/services/marketData');
const { buildGannReport } = require('./src/services/gann');
const { generateAiReport, getDefaultLlmConfig } = require('./src/services/aiReport');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function parseQueryOptions(req) {
  return {
    period: req.query.period || 'daily',
    adjusted: req.query.adjusted || 'forward',
    limit: Number(req.query.limit || 320)
  };
}

async function loadAnalysisBundle(symbol, options) {
  const history = await fetchAStockHistory(symbol, options);
  const report = buildGannReport(history);

  return {
    symbol,
    market: resolveMarket(symbol),
    security: history.security,
    period: history.period,
    adjusted: history.adjusted,
    history,
    report
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'gann-a-share-web' });
});

app.get('/api/llm/defaults', (_req, res) => {
  const defaults = getDefaultLlmConfig();
  res.json({
    ok: true,
    defaults: {
      baseURL: defaults.baseURL,
      model: defaults.model,
      temperature: defaults.temperature,
      systemPrompt: defaults.systemPrompt,
      apiKeyConfigured: Boolean(defaults.apiKey)
    }
  });
});

app.get('/api/history/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.params.symbol);
    const options = parseQueryOptions(req);
    const history = await fetchAStockHistory(symbol, options);

    res.json({
      ok: true,
      symbol,
      market: resolveMarket(symbol),
      security: history.security,
      period: history.period,
      adjusted: history.adjusted,
      candles: history.candles
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error.message || 'Failed to load market history.'
    });
  }
});

app.get('/api/analyze/:symbol', async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.params.symbol);
    const options = parseQueryOptions(req);
    const bundle = await loadAnalysisBundle(symbol, options);

    res.json({
      ok: true,
      symbol: bundle.symbol,
      market: bundle.market,
      security: bundle.security,
      period: bundle.period,
      adjusted: bundle.adjusted,
      report: bundle.report
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error.message || 'Failed to build Gann analysis.'
    });
  }
});

app.post('/api/ai-report', async (req, res) => {
  try {
    const symbol = normalizeSymbol(req.body?.symbol);
    const options = {
      period: req.body?.period || 'daily',
      adjusted: req.body?.adjusted || 'forward',
      limit: Number(req.body?.limit || 320)
    };
    const llm = req.body?.llm || {};
    const bundle = await loadAnalysisBundle(symbol, options);
    const aiResult = await generateAiReport({
      symbol: bundle.symbol,
      market: bundle.market,
      security: bundle.security,
      period: bundle.period,
      adjusted: bundle.adjusted,
      history: bundle.history,
      report: bundle.report,
      llm
    });

    res.json({
      ok: true,
      symbol: bundle.symbol,
      market: bundle.market,
      security: bundle.security,
      period: bundle.period,
      adjusted: bundle.adjusted,
      report: bundle.report,
      ai: aiResult
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error.message || 'Failed to build AI report.'
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Gann A-share web app listening on http://localhost:${port}`);
});
