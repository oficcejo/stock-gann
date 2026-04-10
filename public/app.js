const STORAGE_KEY='gann-llm-config';
const chartContainer=document.getElementById('chart');
const chartFrame=document.getElementById('chartFrame');
const drawingLayer=document.getElementById('drawingLayer');
const drawingHint=document.getElementById('drawingHint');
const toggleFullscreenBtn=document.getElementById('toggleFullscreenBtn');
const controlForm=document.getElementById('controlForm');
const symbolInput=document.getElementById('symbolInput');
const periodSelect=document.getElementById('periodSelect');
const adjustedSelect=document.getElementById('adjustedSelect');
const securityName=document.getElementById('securityName');
const securityMeta=document.getElementById('securityMeta');
const trendBias=document.getElementById('trendBias');
const forecastText=document.getElementById('forecastText');
const priceLevelsEl=document.getElementById('priceLevels');
const timeCyclesEl=document.getElementById('timeCycles');
const summaryListEl=document.getElementById('summaryList');
const guideListEl=document.getElementById('guideList');
const statusText=document.getElementById('statusText');
const aiModal=document.getElementById('aiModal');
const openAiModalBtn=document.getElementById('openAiModalBtn');
const quickAiBtn=document.getElementById('quickAiBtn');
const closeAiModalBtn=document.getElementById('closeAiModalBtn');
const aiMetaEl=document.getElementById('aiMeta');
const aiReportTitleEl=document.getElementById('aiReportTitle');
const aiReportSubtitleEl=document.getElementById('aiReportSubtitle');
const aiReportContentEl=document.getElementById('aiReportContent');
const aiReportPrintableEl=document.getElementById('aiReportPrintable');
const llmBaseUrlInput=document.getElementById('llmBaseUrlInput');
const llmModelInput=document.getElementById('llmModelInput');
const llmApiKeyInput=document.getElementById('llmApiKeyInput');
const llmTemperatureInput=document.getElementById('llmTemperatureInput');
const llmSystemPromptInput=document.getElementById('llmSystemPromptInput');
const generateAiReportBtn=document.getElementById('generateAiReportBtn');
const exportAiPdfBtn=document.getElementById('exportAiPdfBtn');
const metricItemTemplate=document.getElementById('metricItemTemplate');
const squareOfNineMetaEl=document.getElementById('squareOfNineMeta');
const squareOfNineLevelsEl=document.getElementById('squareOfNineLevels');
const wheelOf24MetaEl=document.getElementById('wheelOf24Meta');
const wheelOf24LevelsEl=document.getElementById('wheelOf24Levels');
const wheelOf24TimeEl=document.getElementById('wheelOf24Time');
const s9CanvasEl=document.getElementById('s9Canvas');
const s9PredictionEl=document.getElementById('s9Prediction');
const w24CanvasEl=document.getElementById('w24Canvas');
const w24PredictionEl=document.getElementById('w24Prediction');
const openGannModalBtn=document.getElementById('openGannModalBtn');
const closeGannModalBtn=document.getElementById('closeGannModalBtn');
const gannModal=document.getElementById('gannModal');

const overlayButtons=[...document.querySelectorAll('[data-overlay]')];
const toolButtons=[...document.querySelectorAll('.tool-btn[data-tool]')];
const OVERLAY_LABELS={trend:'趋势',fan:'扇形',time:'时间',level:'水平',s9:'九方格',w24:'轮中轮'};
const FUTURE_BAR_OFFSET=18;
let chart,candleSeries,volumeSeries,latestContext=null,currentAiReport=null,analysisCache=null;
let overlaySeries=[],defaultsLoaded=false,resizeBound=false,drawMode='crosshair',drawings=[],pendingTrendStart=null,pendingTrendEnd=null,drawingRenderFrame=null;
const overlayState={trend:true,fan:true,time:true,level:true,s9:false,w24:false};

function normalizeDrawingsState(input){
  if(!Array.isArray(input)) return [];
  return input.reduce((result,drawing)=>{
    if(!drawing||typeof drawing!=='object') return result;
    if(drawing.type==='trendline'){
      const logical1=Number(drawing.logical1);const price1=Number(drawing.price1);const logical2=Number(drawing.logical2);const price2=Number(drawing.price2);
      if([logical1,price1,logical2,price2].every(Number.isFinite)) result.push({type:'trendline',logical1,price1,logical2,price2});
      return result;
    }
    if(drawing.type==='horizontal'){
      const price=Number(drawing.price);
      if(Number.isFinite(price)) result.push({type:'horizontal',price});
    }
    return result;
  },[]);
}

function snapshotDrawings(){return drawings.map((drawing)=>drawing.type==='trendline'?{type:'trendline',logical1:drawing.logical1,price1:drawing.price1,logical2:drawing.logical2,price2:drawing.price2}:{type:'horizontal',price:drawing.price});}
function emitDrawingsChanged(){const symbol=latestContext?.history?.security?.code;if(!symbol) return;document.dispatchEvent(new CustomEvent('gann:drawings-changed',{detail:{symbol,drawings:snapshotDrawings()}}));}
function restoreDrawingsState(nextDrawings){drawings=normalizeDrawingsState(nextDrawings);pendingTrendStart=null;pendingTrendEnd=null;renderDrawings();updateDrawingHint();updateStatusByContext();syncDrawingRenderLoop();}

function createChart(){
  if(chart) chart.remove();
  chart=LightweightCharts.createChart(chartContainer,{layout:{background:{color:'#07131f'},textColor:'#dbe7f3',fontFamily:'Barlow, Noto Sans SC, sans-serif'},grid:{vertLines:{color:'rgba(143, 169, 192, 0.08)'},horzLines:{color:'rgba(143, 169, 192, 0.08)'}},width:chartContainer.clientWidth,height:chartContainer.clientHeight,crosshair:{mode:LightweightCharts.CrosshairMode.Normal},rightPriceScale:{borderColor:'rgba(143, 169, 192, 0.15)'},timeScale:{borderColor:'rgba(143, 169, 192, 0.15)',timeVisible:true,rightOffset:FUTURE_BAR_OFFSET}});
  candleSeries=chart.addCandlestickSeries({upColor:'#1fd18a',downColor:'#ff5b6e',borderUpColor:'#1fd18a',borderDownColor:'#ff5b6e',wickUpColor:'#1fd18a',wickDownColor:'#ff5b6e',priceLineVisible:true});
  volumeSeries=chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'',color:'rgba(0, 194, 168, 0.45)'});
  volumeSeries.priceScale().applyOptions({scaleMargins:{top:0.82,bottom:0}});
  if(!resizeBound){
    const resizeObserver=new ResizeObserver(()=>requestAnimationFrame(handleResize));
    resizeObserver.observe(chartContainer);
    document.addEventListener('fullscreenchange',handleFullscreenChange);
    resizeBound=true;
  }
  resizeDrawingLayer();
}

function ensureFutureSpace(){
  if(!chart) return;
  chart.timeScale().applyOptions({rightOffset:FUTURE_BAR_OFFSET});
}

function handleResize(){
  if(!chart) return;
  const width=chartContainer.clientWidth;
  const height=chartContainer.clientHeight;
  if(width===0||height===0) return;
  chart.applyOptions({width,height});
  ensureFutureSpace();
  resizeDrawingLayer();
}

function updateFullscreenButton(){
  toggleFullscreenBtn.textContent=document.fullscreenElement===chartFrame?'退出全屏':'全屏图表';
}

function waitAndResize(maxTries=20,interval=50){
  let tries=0;
  const poll=()=>{
    const w=chartContainer.clientWidth,h=chartContainer.clientHeight;
    if(w>0&&h>0){
      chart.applyOptions({width:w,height:h});
      ensureFutureSpace();
      resizeDrawingLayer();
      chart.timeScale().fitContent();
      return;
    }
    if(++tries<maxTries) setTimeout(poll,interval);
  };
  poll();
}

function handleFullscreenChange(){
  updateFullscreenButton();
  waitAndResize();
}

async function toggleChartFullscreen(){
  try{
    if(document.fullscreenElement===chartFrame) await document.exitFullscreen();
    else await chartFrame.requestFullscreen();
  }catch(error){statusText.textContent=`全屏切换失败：${error.message}`;}
}

function clearOverlaySeries(){
  overlaySeries.forEach((entry)=>{try{chart.removeSeries(entry.series);}catch(error){console.warn(error);}});
  overlaySeries=[];
}

function addLineSeries(group,data,options){
  const series=chart.addLineSeries(options);
  series.setData(data);
  overlaySeries.push({group,series});
}

function syncOverlayButtons(){
  overlayButtons.forEach((button)=>{const key=button.dataset.overlay;const active=Boolean(overlayState[key]);button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});
}

function syncToolButtons(){
  toolButtons.forEach((button)=>{const tool=button.dataset.tool;const active=!['undo','clear'].includes(tool)&&tool===drawMode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
}

function getVisibleOverlayText(){
  const visible=Object.entries(overlayState).filter(([,active])=>active).map(([key])=>OVERLAY_LABELS[key]);
  return visible.length?`当前显示 ${visible.join(' / ')} 图层。`:'当前已隐藏所有辅助图层。';
}

function getDrawModeStatus(){
  if(drawMode==='trendline') return pendingTrendStart?'趋势线模式：请在图上再点一次，确定终点。':'趋势线模式：点击一次起点，再点击一次终点。';
  if(drawMode==='horizontal') return '水平线模式：点击图表任意高度即可添加水平线。';
  return '十字模式：可拖动、缩放图表并查看价格与时间坐标。';
}

function updateStatusByContext(){statusText.textContent=`${getVisibleOverlayText()} ${getDrawModeStatus()}`;}

function updateDrawingHint(){
  if(drawMode==='trendline') drawingHint.textContent=pendingTrendStart?'趋势线：已选起点，请点击终点完成画线。':'趋势线：点击起点，再点击终点。';
  else if(drawMode==='horizontal') drawingHint.textContent='水平线：点击图表任意位置，添加一条横向参考线。';
  else drawingHint.textContent='十字模式：可拖动缩放图表。选择“趋势线”或“水平线”后可在图上标注。';
}

function setDrawMode(mode){
  drawMode=mode;pendingTrendStart=null;pendingTrendEnd=null;
  drawingLayer.classList.toggle('is-interactive',drawMode!=='crosshair');
  drawingLayer.style.pointerEvents=drawMode==='crosshair'?'none':'auto';
  syncToolButtons();updateDrawingHint();updateStatusByContext();renderDrawings();
}

function resizeDrawingLayer(){
  const width=Math.max(chartContainer.clientWidth,1);const height=Math.max(chartContainer.clientHeight,1);
  drawingLayer.setAttribute('viewBox',`0 0 ${width} ${height}`);
  drawingLayer.setAttribute('width',String(width));
  drawingLayer.setAttribute('height',String(height));
  renderDrawings();
}

function createSvgNode(tagName,attrs){const node=document.createElementNS('http://www.w3.org/2000/svg',tagName);Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,String(value)));return node;}
function getChartPointFromEvent(event){
  const rect=chartContainer.getBoundingClientRect();
  const x=event.clientX-rect.left;
  const y=event.clientY-rect.top;
  const logical=chart.timeScale().coordinateToLogical(x);
  const price=candleSeries.coordinateToPrice(y);
  if(logical===null||price===null||Number.isNaN(logical)||Number.isNaN(price)) return null;
  return {logical,price};
}

function getScreenPoint(point){
  if(!point) return null;
  const x=chart.timeScale().logicalToCoordinate(point.logical);
  const y=candleSeries.priceToCoordinate(point.price);
  if(x===null||y===null||Number.isNaN(x)||Number.isNaN(y)) return null;
  return {x,y};
}

function syncDrawingRenderLoop(){
  const shouldLoop=drawings.length>0||pendingTrendStart!==null;
  if(!shouldLoop&&drawingRenderFrame!==null){cancelAnimationFrame(drawingRenderFrame);drawingRenderFrame=null;return;}
  if(!shouldLoop||drawingRenderFrame!==null) return;
  const tick=()=>{
    renderDrawings();
    if(drawings.length>0||pendingTrendStart!==null) drawingRenderFrame=requestAnimationFrame(tick);
    else drawingRenderFrame=null;
  };
  drawingRenderFrame=requestAnimationFrame(tick);
}

function renderDrawings(){
  const width=Math.max(chartContainer.clientWidth,1);const height=Math.max(chartContainer.clientHeight,1);drawingLayer.innerHTML='';
  drawings.forEach((drawing)=>{
    if(drawing.type==='trendline'){
      const start=getScreenPoint({logical:drawing.logical1,price:drawing.price1});
      const end=getScreenPoint({logical:drawing.logical2,price:drawing.price2});
      if(!start||!end) return;
      drawingLayer.appendChild(createSvgNode('line',{x1:start.x,y1:start.y,x2:end.x,y2:end.y,class:'drawing-line'}));
      drawingLayer.appendChild(createSvgNode('circle',{cx:start.x,cy:start.y,r:4,class:'drawing-point'}));
      drawingLayer.appendChild(createSvgNode('circle',{cx:end.x,cy:end.y,r:4,class:'drawing-point'}));
      return;
    }
    if(drawing.type==='horizontal'){
      const y=candleSeries.priceToCoordinate(drawing.price);
      if(y===null||Number.isNaN(y)) return;
      drawingLayer.appendChild(createSvgNode('line',{x1:0,y1:y,x2:width,y2:y,class:'drawing-line drawing-line-horizontal'}));
    }
  });
  if(drawMode==='trendline'&&pendingTrendStart){
    const start=getScreenPoint(pendingTrendStart);
    const end=getScreenPoint(pendingTrendEnd||pendingTrendStart);
    if(start&&end){
      drawingLayer.appendChild(createSvgNode('line',{x1:start.x,y1:start.y,x2:end.x,y2:end.y,class:'drawing-line drawing-line-preview'}));
      drawingLayer.appendChild(createSvgNode('circle',{cx:start.x,cy:start.y,r:5,class:'drawing-point'}));
      drawingLayer.appendChild(createSvgNode('circle',{cx:end.x,cy:end.y,r:5,class:'drawing-point drawing-point-preview'}));
    }
  }
}

function handleDrawingClick(event){
  if(drawMode==='crosshair') return;
  if(event.button!==undefined&&event.button!==0) return;
  event.preventDefault();
  let point=getChartPointFromEvent(event);
  if(!point&&drawMode==='trendline'&&pendingTrendEnd) point=pendingTrendEnd;
  if(!point) return;
  if(drawMode==='trendline'){
    if(!pendingTrendStart){pendingTrendStart=point;pendingTrendEnd=point;updateDrawingHint();updateStatusByContext();renderDrawings();syncDrawingRenderLoop();return;}
    drawings.push({type:'trendline',logical1:pendingTrendStart.logical,price1:pendingTrendStart.price,logical2:point.logical,price2:point.price});
    setDrawMode('crosshair');
    syncDrawingRenderLoop();
    emitDrawingsChanged();
    return;
  }
  if(drawMode==='horizontal'){
    drawings.push({type:'horizontal',price:point.price});
    setDrawMode('crosshair');
    syncDrawingRenderLoop();
    emitDrawingsChanged();
    return;
  }
  renderDrawings();updateDrawingHint();updateStatusByContext();syncDrawingRenderLoop();
}

function handleDrawingMove(event){
  if(drawMode!=='trendline'||!pendingTrendStart) return;
  const point=getChartPointFromEvent(event);
  if(!point) return;
  pendingTrendEnd=point;
  renderDrawings();
}

function handleDrawingLeave(){
  if(drawMode!=='trendline'||!pendingTrendStart) return;
  pendingTrendEnd=pendingTrendStart;
  renderDrawings();
}

function undoDrawing(){pendingTrendStart=null;pendingTrendEnd=null;if(drawings.length) drawings.pop();renderDrawings();updateDrawingHint();updateStatusByContext();syncDrawingRenderLoop();emitDrawingsChanged();}
function clearDrawings(){drawings=[];pendingTrendStart=null;pendingTrendEnd=null;renderDrawings();updateDrawingHint();updateStatusByContext();syncDrawingRenderLoop();emitDrawingsChanged();}
function toggleOverlay(key){overlayState[key]=!overlayState[key];syncOverlayButtons();if(latestContext){renderOverlays(latestContext.history,latestContext.report);renderGuide(latestContext.history,latestContext.report);}else updateStatusByContext();}
function buildTrendLines(history,report){
  const lowCandle=history.candles[report.pivots.low.index];
  const highCandle=history.candles[report.pivots.high.index];
  const lastCandle=history.candles[history.candles.length-1];
  addLineSeries('trend',[{time:lowCandle.timestamp,value:report.pivots.low.price},{time:highCandle.timestamp,value:report.pivots.high.price}],{color:'#7fe7c4',lineWidth:3,crosshairMarkerVisible:false,priceLineVisible:false,lastValueVisible:false});
  addLineSeries('trend',[{time:highCandle.timestamp,value:report.pivots.high.price},{time:lastCandle.timestamp,value:report.forecast.lastClose}],{color:report.forecast.trendBias==='bullish'?'#1fd18a':report.forecast.trendBias==='bearish'?'#ff5b6e':'#ffb84d',lineWidth:2,lineStyle:LightweightCharts.LineStyle.Dashed,crosshairMarkerVisible:false,priceLineVisible:false,lastValueVisible:false});
}

function buildFanLines(report){
  report.fanLines.forEach((line,index)=>{addLineSeries('fan',[{time:line.start.time,value:line.start.value},{time:line.end.time,value:line.end.value}],{color:['#00c2a8','#16b9ff','#ffb84d','#f86a8c','#90be6d','#caa8ff'][index%6],lineWidth:line.label==='1x1'?2:1,lineStyle:line.label==='1x1'?LightweightCharts.LineStyle.Solid:LightweightCharts.LineStyle.Dashed,crosshairMarkerVisible:false,priceLineVisible:false,lastValueVisible:false});});
}

function buildPriceLevels(history,report){
  report.priceLevels.forEach((level)=>{addLineSeries('level',history.candles.map((item)=>({time:item.timestamp,value:level.value})),{color:'rgba(255, 184, 77, 0.28)',lineWidth:level.label==='50%'?2:1,lineStyle:LightweightCharts.LineStyle.Dotted,crosshairMarkerVisible:false,priceLineVisible:false,lastValueVisible:false});});
}

function buildTimeCycles(history,report){
  const low=Math.min(...history.candles.map((item)=>item.low));
  const high=Math.max(...history.candles.map((item)=>item.high));
  report.timeCycles.forEach((cycle)=>{addLineSeries('time',[{time:cycle.timestamp,value:low},{time:cycle.timestamp,value:high}],{color:'rgba(22, 185, 255, 0.22)',lineWidth:1,lineStyle:LightweightCharts.LineStyle.Dashed,crosshairMarkerVisible:false,priceLineVisible:false,lastValueVisible:false});});
}

function buildSquareOfNineOverlay(history,report){
  if(!report.squareOfNine) return;
  const s9=report.squareOfNine;const pick=[45,90,180,360];
  const items=[...s9.resistances.filter((r)=>pick.includes(r.angle)).map((r)=>({p:r.price,c:'rgba(255, 91, 110, 0.4)'})),...s9.supports.filter((s)=>pick.includes(s.angle)).map((s)=>({p:s.price,c:'rgba(31, 209, 138, 0.4)'}))];
  items.forEach((item)=>{addLineSeries('s9',history.candles.map((c)=>({time:c.timestamp,value:item.p})),{color:item.c,lineWidth:1,lineStyle:LightweightCharts.LineStyle.LargeDashed,crosshairMarkerVisible:false,priceLineVisible:false,lastValueVisible:false});});
}

function buildWheelOf24Overlay(history,report){
  if(!report.wheelOf24) return;
  const w24=report.wheelOf24;
  const items=[...w24.cardinalLevels.map((l)=>({p:l.price,c:l.direction==='resistance'?'rgba(255, 91, 110, 0.45)':'rgba(31, 209, 138, 0.45)'})),...w24.ordinalLevels.map((l)=>({p:l.price,c:l.direction==='resistance'?'rgba(202, 168, 255, 0.3)':'rgba(22, 185, 255, 0.3)'}))];
  items.forEach((item)=>{addLineSeries('w24',history.candles.map((c)=>({time:c.timestamp,value:item.p})),{color:item.c,lineWidth:1,lineStyle:LightweightCharts.LineStyle.SparseDotted,crosshairMarkerVisible:false,priceLineVisible:false,lastValueVisible:false});});
}

function renderOverlays(history,report){
  clearOverlaySeries();
  if(overlayState.trend) buildTrendLines(history,report);
  if(overlayState.fan) buildFanLines(report);
  if(overlayState.level) buildPriceLevels(history,report);
  if(overlayState.time) buildTimeCycles(history,report);
  if(overlayState.s9) buildSquareOfNineOverlay(history,report);
  if(overlayState.w24) buildWheelOf24Overlay(history,report);
}

function renderMetricList(container,items,formatter){
  container.innerHTML='';
  items.forEach((item)=>{const formatted=formatter(item);const node=metricItemTemplate.content.firstElementChild.cloneNode(true);node.querySelector('.metric-name').textContent=formatted.name;node.querySelector('.metric-value').textContent=formatted.value;container.appendChild(node);});
}

function renderSummary(summary){summaryListEl.innerHTML='';summary.forEach((text)=>{const p=document.createElement('p');p.textContent=text;summaryListEl.appendChild(p);});}
function findNearestLevel(levels,lastClose){return levels.reduce((closest,level)=>{const distance=Math.abs(level.value-lastClose);if(!closest||distance<closest.distance) return {...level,distance};return closest;},null);}
function findNextLevels(levels,lastClose){const sorted=[...levels].sort((a,b)=>a.value-b.value);return{support:[...sorted].reverse().find((level)=>level.value<=lastClose)||null,resistance:sorted.find((level)=>level.value>=lastClose)||null};}

function renderGuide(history,report){
  const lastClose=report.forecast.lastClose;
  const nearestLevel=findNearestLevel(report.priceLevels,lastClose);
  const {support,resistance}=findNextLevels(report.priceLevels,lastClose);
  const mainFan=report.fanLines.find((line)=>line.label==='1x1');
  const nextCycle=report.forecast.nextTimeWindows[0];
  const guides=[
    `先看趋势：低点 ${report.pivots.low.date} 到高点 ${report.pivots.high.date} 是本轮主升跌段，当前判定为${trendBias.textContent}。打开“趋势”后，实线看主趋势，虚线看高点后的延续方向。`,
    `再看扇形：1x1 是江恩角度的核心线，价格在其上方通常偏强，在其下方通常偏弱。当前 1x1 末端参考位约 ${mainFan?mainFan.end.value.toFixed(2):'--'}。`,
    `再看水平位：离现价最近的分割位是 ${nearestLevel?`${nearestLevel.label}（${nearestLevel.value.toFixed(2)}）`:'--'}。可把 ${support?support.value.toFixed(2):'--'} 视为短线支撑，把 ${resistance?resistance.value.toFixed(2):'--'} 视为短线压力。`,
    `最后看时间：竖线是江恩时间窗口。${nextCycle?`下一关注窗口约在 ${nextCycle.cycle} 周期后，还差 ${nextCycle.barsAway} 根K线。`:'当前样本内的主要时间窗口已经走完，需要继续观察新K线。'}`
  ];
  if(report.squareOfNine){const s9n=report.squareOfNine.nearest;guides.push(`九方格：当前角度 ${report.squareOfNine.currentAngle}°。最近上方阻力 ${s9n.resistance?s9n.resistance.price:'--'}，最近下方支撑 ${s9n.support?s9n.support.price:'--'}。打开 S9 图层可查看。`);}
  if(report.wheelOf24){guides.push(`轮中轮：位于第 ${report.wheelOf24.sector} 扇区（${report.wheelOf24.sectorRange}）。十字线和×线交叉标注了关键共振价位，打开 W24 图层可查看。`);}
  guideListEl.innerHTML='';
  guides.forEach((text)=>{const p=document.createElement('p');p.textContent=text;guideListEl.appendChild(p);});
  updateStatusByContext();
}

function setForecast(report){
  const forecast=report.forecast;
  const biasText=forecast.trendBias==='bullish'?'多头占优':forecast.trendBias==='bearish'?'空头占优':'震荡平衡';
  const targets=forecast.priceTargets.map((item)=>`${item.label}: ${item.value}`).join(' / ');
  const windows=forecast.nextTimeWindows.map((item)=>`${item.cycle}周期后约 ${item.barsAway} 根K线`).join('，');
  trendBias.textContent=biasText;
  trendBias.className=`hero-value ${forecast.trendBias}`;
  forecastText.textContent=`最新收盘 ${forecast.lastClose}，短线动量 ${forecast.momentum}%。关注价格目标 ${targets}；下一组时间窗口 ${windows||'已在当前样本内完成'}。`;
}

/* ── S9 极坐标图 ────────────────────────── */
function drawS9Chart(s9){
  if(!s9CanvasEl) return;
  const ctx=s9CanvasEl.getContext('2d');
  const S=700,cx=S/2,cy=S/2,maxR=cx-60;
  ctx.clearRect(0,0,S,S);
  ctx.beginPath();ctx.arc(cx,cy,maxR+30,0,Math.PI*2);
  ctx.fillStyle='rgba(5,15,24,0.92)';ctx.fill();
  [0.25,0.5,0.75,1].forEach(f=>{ctx.beginPath();ctx.arc(cx,cy,maxR*f,0,Math.PI*2);ctx.strokeStyle='rgba(143,169,192,0.08)';ctx.lineWidth=1;ctx.stroke();});
  [0,45,90,135,180,225,270,315].forEach(a=>{
    const rad=(a-90)*Math.PI/180,isC=a%90===0;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(rad)*maxR,cy+Math.sin(rad)*maxR);
    ctx.strokeStyle=isC?'rgba(0,194,168,0.32)':'rgba(255,184,77,0.15)';ctx.lineWidth=isC?1.5:0.8;ctx.stroke();
  });
  const curRad=(s9.currentAngle-90)*Math.PI/180;
  ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(curRad)*maxR,cy+Math.sin(curRad)*maxR);
  ctx.strokeStyle='rgba(31,209,138,0.5)';ctx.lineWidth=2.5;ctx.stroke();
  const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,28);
  glow.addColorStop(0,'rgba(31,209,138,0.35)');glow.addColorStop(1,'rgba(31,209,138,0)');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,28,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(cx,cy,9,0,Math.PI*2);ctx.fillStyle='#1fd18a';ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.7)';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#edf4fb';ctx.font='bold 28px Barlow,Noto Sans SC,sans-serif';ctx.textAlign='center';
  ctx.fillText(s9.basePrice.toFixed(2),cx,cy-26);
  const ringR={45:0.28,90:0.42,120:0.50,180:0.62,270:0.72,360:0.82,720:0.93};
  s9.resistances.filter(r=>ringR[r.angle]).forEach(r=>{
    const a=(s9.currentAngle+r.angle)%360,rad=(a-90)*Math.PI/180,rr=maxR*ringR[r.angle];
    const lx=cx+Math.cos(rad)*rr,ly=cy+Math.sin(rad)*rr;
    ctx.beginPath();ctx.arc(lx,ly,8,0,Math.PI*2);ctx.fillStyle='rgba(255,91,110,0.85)';ctx.fill();
    ctx.fillStyle='rgba(255,91,110,0.95)';ctx.font='26px Barlow,sans-serif';ctx.textAlign='center';
    ctx.fillText(r.price.toFixed(0),lx,ly-18);
    ctx.fillStyle='rgba(255,91,110,0.55)';ctx.font='20px Barlow,sans-serif';ctx.fillText(r.label,lx,ly+26);
  });
  s9.supports.filter(s=>ringR[s.angle]).forEach(s=>{
    const a=(s9.currentAngle-s.angle+720)%360,rad=(a-90)*Math.PI/180;
    const invR={45:0.28,90:0.42,120:0.50,180:0.62,270:0.72,360:0.82,720:0.93};
    const rr=maxR*invR[s.angle]*0.85;
    if(rr<30) return;
    const lx=cx+Math.cos(rad)*rr,ly=cy+Math.sin(rad)*rr;
    ctx.beginPath();ctx.arc(lx,ly,8,0,Math.PI*2);ctx.fillStyle='rgba(31,209,138,0.85)';ctx.fill();
    ctx.fillStyle='rgba(31,209,138,0.95)';ctx.font='26px Barlow,sans-serif';ctx.textAlign='center';
    ctx.fillText(s.price.toFixed(0),lx,ly-18);
    ctx.fillStyle='rgba(31,209,138,0.55)';ctx.font='20px Barlow,sans-serif';ctx.fillText(s.label,lx,ly+26);
  });
  [0,45,90,135,180,225,270,315].forEach(a=>{
    const rad=(a-90)*Math.PI/180,lr=maxR+32;
    ctx.fillStyle='#8fa9c0';ctx.font='22px Barlow,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(a+'°',cx+Math.cos(rad)*lr,cy+Math.sin(rad)*lr);
  });
  ctx.fillStyle='rgba(143,169,192,0.4)';ctx.font='20px Barlow,sans-serif';ctx.textAlign='center';
  ctx.fillText('SQUARE OF NINE',cx,cy+20);
}

function genS9Prediction(s9){
  if(!s9PredictionEl||!s9) return;
  const n=s9.nearest;if(!n.resistance||!n.support){s9PredictionEl.innerHTML='';return;}
  const dR=Math.abs(n.resistance.change),dS=Math.abs(n.support.change);
  const r90=s9.resistances.find(r=>r.angle===90),s90=s9.supports.find(s=>s.angle===90);
  const r360=s9.resistances.find(r=>r.angle===360),s360=s9.supports.find(s=>s.angle===360);
  let html=`<span class="pred-label res">阻力</span>最近 ${n.resistance.price}（${n.resistance.label}，距 ${n.resistance.change>0?'+':''}${n.resistance.change}%）`;
  if(r90) html+=`→ 次阻力 ${r90.price}（${r90.label}）`;
  html+=`<br><span class="pred-label sup">支撑</span>最近 ${n.support.price}（${n.support.label}，距 ${n.support.change}%）`;
  if(s90) html+=`→ 次支撑 ${s90.price}（${s90.label}）`;
  html+=`<br><span class="pred-label hint">研判</span>`;
  if(dR<dS) html+=`价格偏向阻力侧，关注能否突破 ${n.resistance.price}。突破后目标 ${r90?r90.price:'--'}。`;
  else html+=`价格偏向支撑侧，关注 ${n.support.price} 能否守住。失守则看向 ${s90?s90.price:'--'}。`;
  if(r360) html+=` 360°强阻力 ${r360.price}（距 ${r360.change>0?'+':''}${r360.change}%）。`;
  s9PredictionEl.innerHTML=html;
}

function drawW24Chart(w24){
  if(!w24CanvasEl) return;
  const ctx=w24CanvasEl.getContext('2d');
  const S=700,cx=S/2,cy=S/2,maxR=cx-50;
  ctx.clearRect(0,0,S,S);
  ctx.beginPath();ctx.arc(cx,cy,maxR+30,0,Math.PI*2);
  ctx.fillStyle='rgba(5,15,24,0.92)';ctx.fill();
  for(let i=0;i<24;i++){
    const a=i*15,rad=(a-90)*Math.PI/180,isC=a%90===0,isO=a%45===0&&!isC;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.cos(rad)*maxR,cy+Math.sin(rad)*maxR);
    ctx.strokeStyle=isC?'rgba(0,194,168,0.45)':isO?'rgba(255,184,77,0.3)':'rgba(143,169,192,0.07)';
    ctx.lineWidth=isC?2:isO?1.5:0.6;ctx.stroke();
  }
  [0.33,0.66,1].forEach(f=>{ctx.beginPath();ctx.arc(cx,cy,maxR*f,0,Math.PI*2);ctx.strokeStyle='rgba(143,169,192,0.06)';ctx.lineWidth=1;ctx.stroke();});
  const ss=(w24.sector-1)*15,se=w24.sector*15;
  ctx.beginPath();ctx.moveTo(cx,cy);
  ctx.arc(cx,cy,maxR*0.88,(ss-90)*Math.PI/180,(se-90)*Math.PI/180);
  ctx.closePath();ctx.fillStyle='rgba(22,185,255,0.08)';ctx.fill();
  const pRad=(w24.wheelAngle-90)*Math.PI/180,pR=maxR*0.38;
  const px=cx+Math.cos(pRad)*pR,py=cy+Math.sin(pRad)*pR;
  const glow=ctx.createRadialGradient(px,py,0,px,py,28);
  glow.addColorStop(0,'rgba(22,185,255,0.35)');glow.addColorStop(1,'rgba(22,185,255,0)');
  ctx.fillStyle=glow;ctx.beginPath();ctx.arc(px,py,28,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(px,py,9,0,Math.PI*2);ctx.fillStyle='#16b9ff';ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.7)';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#edf4fb';ctx.font='bold 28px Barlow,Noto Sans SC,sans-serif';ctx.textAlign='center';
  ctx.fillText(w24.basePrice.toFixed(2),px,py-28);
  w24.cardinalLevels.forEach(l=>{
    const rad=(l.angle-90)*Math.PI/180,rr=maxR*(l.direction==='resistance'?0.78:0.55);
    const lx=cx+Math.cos(rad)*rr,ly=cy+Math.sin(rad)*rr;
    ctx.beginPath();ctx.arc(lx,ly,7,0,Math.PI*2);
    ctx.fillStyle=l.direction==='resistance'?'#ff5b6e':'#1fd18a';ctx.fill();
    ctx.fillStyle=l.direction==='resistance'?'rgba(255,91,110,0.95)':'rgba(31,209,138,0.95)';
    ctx.font='22px Barlow,sans-serif';ctx.textAlign='center';ctx.fillText(l.price.toFixed(0),lx,ly-16);
  });
  w24.ordinalLevels.forEach(l=>{
    const rad=(l.angle-90)*Math.PI/180,rr=maxR*(l.direction==='resistance'?0.72:0.48);
    const lx=cx+Math.cos(rad)*rr,ly=cy+Math.sin(rad)*rr;
    ctx.beginPath();ctx.arc(lx,ly,5,0,Math.PI*2);
    ctx.fillStyle=l.direction==='resistance'?'rgba(202,168,255,0.85)':'rgba(22,185,255,0.85)';ctx.fill();
    ctx.fillStyle=l.direction==='resistance'?'rgba(202,168,255,0.9)':'rgba(22,185,255,0.9)';
    ctx.font='20px Barlow,sans-serif';ctx.textAlign='center';ctx.fillText(l.price.toFixed(0),lx,ly-14);
  });
  [0,45,90,135,180,225,270,315].forEach(a=>{
    const rad=(a-90)*Math.PI/180,lr=maxR+30;
    ctx.fillStyle='#8fa9c0';ctx.font='22px Barlow,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(a+'°',cx+Math.cos(rad)*lr,cy+Math.sin(rad)*lr);
  });
  ctx.fillStyle='rgba(143,169,192,0.4)';ctx.font='20px Barlow,sans-serif';ctx.textAlign='center';
  ctx.fillText('WHEEL OF 24',cx,cy+20);
}

function genW24Prediction(w24){
  if(!w24PredictionEl||!w24) return;
  const cSup=w24.cardinalLevels.filter(l=>l.direction==='support').sort((a,b)=>b.price-a.price);
  const cRes=w24.cardinalLevels.filter(l=>l.direction==='resistance').sort((a,b)=>a.price-b.price);
  let html=`<span class="pred-label hint">定位</span>角度 ${w24.wheelAngle}°，第 ${w24.sector} 扇区（${w24.sectorRange}）`;
  if(cSup.length&&cRes.length){
    html+=`<br><span class="pred-label res">阻力</span>十字线最近 ${cRes[0].price}（${cRes[0].angle}°，距 ${cRes[0].change>0?'+':''}${cRes[0].change}%）`;
    if(cRes.length>1) html+=`→ 次阻力 ${cRes[1].price}`;
    html+=`<br><span class="pred-label sup">支撑</span>十字线最近 ${cSup[0].price}（${cSup[0].angle}°，距 ${cSup[0].change}%）`;
    if(cSup.length>1) html+=`→ 次支撑 ${cSup[1].price}`;
    html+=`<br><span class="pred-label hint">研判</span>突破 ${cRes[0].price} 目标 ${cRes.length>1?cRes[1].price:'--'}；跌破 ${cSup[0].price} 则看 ${cSup.length>1?cSup[1].price:'--'}。`;
  }
  if(w24.timeForecast.length>=2){
    html+=`<br><span class="pred-label time">时间</span>${w24.timeForecast[0].label}（${w24.timeForecast[0].date}）及 ${w24.timeForecast[1].label}（${w24.timeForecast[1].date}）若共振极可能转折。`;
  }
  w24PredictionEl.innerHTML=html;
}

function renderSquareOfNine(report){
  const s9=report.squareOfNine;
  if(!s9){if(squareOfNineMetaEl)squareOfNineMetaEl.textContent='数据不足';if(squareOfNineLevelsEl)squareOfNineLevelsEl.innerHTML='';if(s9PredictionEl)s9PredictionEl.innerHTML='';return;}
  if(squareOfNineMetaEl)squareOfNineMetaEl.textContent=`基准 ${s9.basePrice} · √${s9.sqrtBase} · 角度 ${s9.currentAngle}°`;
  drawS9Chart(s9);genS9Prediction(s9);
  const pick=[45,90,120,180,270,360,720];
  const items=[];
  s9.resistances.filter((r)=>pick.includes(r.angle)).forEach((r)=>{items.push({name:`▲ ${r.label}`,value:`${r.price} (${r.change>0?'+':''}${r.change}%)`});});
  s9.supports.filter((s)=>pick.includes(s.angle)).forEach((s)=>{items.push({name:`▼ ${s.label}`,value:`${s.price} (${s.change}%)`});});
  if(squareOfNineLevelsEl)renderMetricList(squareOfNineLevelsEl,items,(i)=>i);
}

function renderWheelOf24(report){
  const w24=report.wheelOf24;
  if(!w24){if(wheelOf24MetaEl)wheelOf24MetaEl.textContent='数据不足';if(wheelOf24LevelsEl)wheelOf24LevelsEl.innerHTML='';if(wheelOf24TimeEl)wheelOf24TimeEl.innerHTML='';if(w24PredictionEl)w24PredictionEl.innerHTML='';return;}
  if(wheelOf24MetaEl)wheelOf24MetaEl.textContent=`角度 ${w24.wheelAngle}° · 第${w24.sector}扇区 · ${w24.sectorRange}`;
  drawW24Chart(w24);genW24Prediction(w24);
  const levels=[...w24.cardinalLevels.map((l)=>({...l,cross:'十'})),...w24.ordinalLevels.map((l)=>({...l,cross:'×'}))].sort((a,b)=>a.price-b.price);
  if(wheelOf24LevelsEl)renderMetricList(wheelOf24LevelsEl,levels,(l)=>({name:`${l.direction==='resistance'?'▲':'▼'} ${l.angle}° ${l.cross}`,value:`${l.price} (${l.change>0?'+':''}${l.change}%)`}));
  if(wheelOf24TimeEl)renderMetricList(wheelOf24TimeEl,w24.timeForecast,(t)=>({name:t.label,value:t.date}));
}

function getCurrentQuery(){return{symbol:symbolInput.value.trim(),period:periodSelect.value,adjusted:adjustedSelect.value,limit:320};}
function readLlmConfig(){return{baseURL:llmBaseUrlInput.value.trim(),model:llmModelInput.value.trim(),apiKey:llmApiKeyInput.value.trim(),temperature:Number(llmTemperatureInput.value||0.4),systemPrompt:llmSystemPromptInput.value.trim()};}
function applyLlmConfig(config){llmBaseUrlInput.value=config.baseURL||'';llmModelInput.value=config.model||'';llmApiKeyInput.value=config.apiKey||'';llmTemperatureInput.value=String(Number.isFinite(Number(config.temperature))?Number(config.temperature):0.4);llmSystemPromptInput.value=config.systemPrompt||'';}
function saveLlmConfig(){localStorage.setItem(STORAGE_KEY,JSON.stringify(readLlmConfig()));}
function loadSavedLlmConfig(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');}catch(_error){return{};}}
function setAiReportMeta(text){aiMetaEl.textContent=text;}
function resetAiReportState(message='配置 OpenAI 兼容接口后，点击“生成 AI 报告”。'){currentAiReport=null;aiReportTitleEl.textContent='AI 江恩分析报告';aiReportSubtitleEl.textContent=message;aiReportContentEl.textContent=message;setAiReportMeta('未生成');exportAiPdfBtn.disabled=true;}

function renderAiReport(ai){
  currentAiReport={...ai};
  const generatedLabel=new Date(ai.generatedAt).toLocaleString('zh-CN');
  const reportName=ai.securityName||ai.name||latestContext?.history?.security?.name||'\u6807\u7684';
  aiReportTitleEl.textContent=`${reportName} AI \u6c5f\u6069\u5206\u6790\u62a5\u544a`;
  aiReportSubtitleEl.textContent=`${ai.model} | ${generatedLabel}`;
  aiReportContentEl.textContent=ai.content;
  setAiReportMeta(`${ai.model} | ${generatedLabel}`);
  exportAiPdfBtn.disabled=false;
}

function formatPeriodLabel(period){return period==='daily'?'日线':period==='weekly'?'周线':period==='monthly'?'月线':period||'--';}
function formatAdjustedLabel(adjusted){return adjusted==='forward'?'前复权':adjusted==='backward'?'后复权':adjusted==='none'?'不复权':adjusted||'--';}

function createMetaLine(label,value){
  const row=document.createElement('div');
  row.style.display='flex';row.style.justifyContent='space-between';row.style.gap='16px';row.style.padding='12px 0';row.style.borderBottom='1px solid rgba(154, 184, 211, 0.12)';
  const name=document.createElement('span');name.textContent=label;name.style.color='#8fa9c0';
  const text=document.createElement('span');text.textContent=value;text.style.color='#edf4fb';text.style.fontWeight='600';text.style.textAlign='right';
  row.append(name,text);return row;
}

function buildPdfExportStage(){
  const query=currentAiReport?.symbol?{symbol:currentAiReport.symbol,period:currentAiReport.period||getCurrentQuery().period,adjusted:currentAiReport.adjusted||getCurrentQuery().adjusted}:latestContext?.query||getCurrentQuery();
  const security=currentAiReport?.symbol?{code:currentAiReport.symbol,name:currentAiReport.securityName||currentAiReport.name||query.symbol}:latestContext?.history?.security||{code:query.symbol,name:query.symbol};
  const market=currentAiReport?.market||latestContext?.history?.market||'--';
  const generatedAt=currentAiReport?.generatedAt?new Date(currentAiReport.generatedAt).toLocaleString('zh-CN'):new Date().toLocaleString('zh-CN');
  const stage=document.createElement('div');
  stage.style.position='fixed';stage.style.left='-20000px';stage.style.top='0';stage.style.width='1122px';stage.style.background='#07131f';stage.style.color='#edf4fb';stage.style.fontFamily='"Noto Sans SC", "Microsoft YaHei", sans-serif';stage.style.padding='0';stage.style.zIndex='-1';
  const cover=document.createElement('section');
  cover.style.minHeight='1587px';cover.style.padding='88px 84px';cover.style.background='linear-gradient(180deg, #0a1825 0%, #07131f 100%)';cover.style.display='flex';cover.style.flexDirection='column';cover.style.justifyContent='space-between';
  const coverTop=document.createElement('div');
  const coverKicker=document.createElement('div');coverKicker.textContent='GANN LAB · AI RESEARCH REPORT';coverKicker.style.color='#8fa9c0';coverKicker.style.fontSize='24px';coverKicker.style.letterSpacing='0.2em';
  const coverTitle=document.createElement('h1');coverTitle.textContent=`${security.name}（${security.code}.${market}）江恩 AI 分析报告`;coverTitle.style.margin='28px 0 18px';coverTitle.style.fontSize='54px';coverTitle.style.lineHeight='1.25';
  const coverDesc=document.createElement('p');coverDesc.textContent='基于 A 股历史行情、江恩价格分割、扇形线与时间周期，由 OpenAI 兼容大模型生成的研究型分析报告。';coverDesc.style.margin='0';coverDesc.style.color='#c6d6e6';coverDesc.style.fontSize='24px';coverDesc.style.lineHeight='1.8';
  const metaBox=document.createElement('div');
  metaBox.style.marginTop='48px';metaBox.style.padding='26px 30px';metaBox.style.borderRadius='24px';metaBox.style.border='1px solid rgba(154, 184, 211, 0.14)';metaBox.style.background='rgba(255, 255, 255, 0.04)';
  metaBox.append(createMetaLine('分析标的',`${security.name} / ${security.code}`),createMetaLine('图表周期',formatPeriodLabel(query.period)),createMetaLine('复权方式',formatAdjustedLabel(query.adjusted)),createMetaLine('趋势判断',trendBias.textContent||'--'),createMetaLine('AI 模型',currentAiReport?.model||llmModelInput.value.trim()||'--'),createMetaLine('生成时间',generatedAt));
  coverTop.append(coverKicker,coverTitle,coverDesc,metaBox);
  const coverBottom=document.createElement('div');coverBottom.style.display='grid';coverBottom.style.gap='18px';
  const coverInsight=document.createElement('div');
  coverInsight.style.padding='24px 28px';coverInsight.style.borderRadius='24px';coverInsight.style.background='radial-gradient(circle at top right, rgba(0, 194, 168, 0.2), transparent 45%), rgba(255, 255, 255, 0.04)';coverInsight.style.border='1px solid rgba(154, 184, 211, 0.14)';coverInsight.textContent=forecastText.textContent||'基于当前图表与江恩结构生成 AI 分析报告。';coverInsight.style.fontSize='24px';coverInsight.style.lineHeight='1.8';
  const coverRisk=document.createElement('p');coverRisk.textContent='风险提示：本报告仅供研究与教学演示，不构成投资建议。';coverRisk.style.margin='0';coverRisk.style.color='#8fa9c0';coverRisk.style.fontSize='22px';
  coverBottom.append(coverInsight,coverRisk);cover.append(coverTop,coverBottom);
  const reportPage=document.createElement('section');reportPage.style.padding='64px 72px 72px';reportPage.style.background='#07131f';
  const reportHeader=document.createElement('div');reportHeader.style.padding='0 0 22px';reportHeader.style.marginBottom='26px';reportHeader.style.borderBottom='1px solid rgba(154, 184, 211, 0.14)';
  const reportTitle=document.createElement('h2');reportTitle.textContent=aiReportTitleEl.textContent||'AI 江恩分析报告';reportTitle.style.margin='0';reportTitle.style.fontSize='38px';
  const reportSubtitle=document.createElement('p');reportSubtitle.textContent=aiReportSubtitleEl.textContent||generatedAt;reportSubtitle.style.margin='12px 0 0';reportSubtitle.style.color='#8fa9c0';reportSubtitle.style.fontSize='20px';
  reportHeader.append(reportTitle,reportSubtitle);
  const reportBody=aiReportPrintableEl.cloneNode(true);reportBody.style.margin='0';reportBody.style.padding='0';reportBody.style.border='none';reportBody.style.background='transparent';
  const reportHead=reportBody.querySelector('.report-head');if(reportHead) reportHead.remove();
  const reportBox=reportBody.querySelector('.report-box');
  if(reportBox){reportBox.style.maxHeight='none';reportBox.style.overflow='visible';reportBox.style.marginTop='24px';reportBox.style.fontSize='22px';reportBox.style.lineHeight='1.95';}
  const appendix=document.createElement('div');appendix.style.marginTop='36px';appendix.style.paddingTop='22px';appendix.style.borderTop='1px solid rgba(154, 184, 211, 0.14)';appendix.style.color='#8fa9c0';appendix.style.fontSize='18px';appendix.style.lineHeight='1.8';appendix.textContent='说明：AI 报告基于当前页面中的江恩理论计算结果生成，适合与趋势线、价格分割位和时间窗口一并交叉验证。';
  reportPage.append(reportHeader,reportBody,appendix);stage.append(cover,reportPage);document.body.appendChild(stage);return stage;
}

function canvasToPagedPdf(canvas){
  const {jsPDF}=window.jspdf;
  const pdf=new jsPDF('p','mm','a4');
  const pageWidth=pdf.internal.pageSize.getWidth();
  const pageHeight=pdf.internal.pageSize.getHeight();
  const pageHeightPx=Math.floor(canvas.width*pageHeight/pageWidth);
  let renderedHeight=0,pageIndex=0;
  while(renderedHeight<canvas.height){
    const sliceHeight=Math.min(pageHeightPx,canvas.height-renderedHeight);
    const pageCanvas=document.createElement('canvas');pageCanvas.width=canvas.width;pageCanvas.height=sliceHeight;
    const context=pageCanvas.getContext('2d');
    context.drawImage(canvas,0,renderedHeight,canvas.width,sliceHeight,0,0,canvas.width,sliceHeight);
    if(pageIndex>0) pdf.addPage();
    const imgData=pageCanvas.toDataURL('image/png');
    pdf.addImage(imgData,'PNG',0,0,pageWidth,sliceHeight*pageWidth/canvas.width,undefined,'FAST');
    renderedHeight+=sliceHeight;pageIndex+=1;
  }
  return pdf;
}

function openAiModal(){aiModal.classList.add('is-open');aiModal.setAttribute('aria-hidden','false');document.body.classList.add('modal-open');}
function closeAiModal(){aiModal.classList.remove('is-open');aiModal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open');}

function parseJsonFromText(text){
  try{return JSON.parse(text);}catch(_error){const compact=text.trim().slice(0,180);throw new Error(compact.startsWith('<')?'服务端返回了 HTML，而不是 JSON。通常是旧版服务还在运行，请重启 node 服务后再试。':`服务端返回了非 JSON 内容：${compact||'空响应'}`);}
}

async function readJsonResponse(response){const text=await response.text();return parseJsonFromText(text);}

async function loadLlmDefaults(){
  if(defaultsLoaded) return;
  try{
    const response=await fetch('/api/llm/defaults');
    const payload=await readJsonResponse(response);
    const saved=loadSavedLlmConfig();
    if(payload.ok) applyLlmConfig({...payload.defaults,...saved,apiKey:saved.apiKey||''});
    else applyLlmConfig(saved);
  }catch(_error){applyLlmConfig(loadSavedLlmConfig());}
  defaultsLoaded=true;
}

async function loadData(query){
  const [historyRes,analysisRes]=await Promise.all([
    fetch(`/api/history/${query.symbol}?period=${query.period}&adjusted=${query.adjusted}&limit=${query.limit}`),
    fetch(`/api/analyze/${query.symbol}?period=${query.period}&adjusted=${query.adjusted}&limit=${query.limit}`)
  ]);
  const history=await readJsonResponse(historyRes);
  const analysis=await readJsonResponse(analysisRes);
  if(!history.ok) throw new Error(history.message||'加载历史行情失败。');
  if(!analysis.ok) throw new Error(analysis.message||'加载江恩分析失败。');
  return {history,analysis};
}

async function render(query){
  forecastText.textContent='正在加载行情与江恩分析...';
  statusText.textContent='正在计算趋势、扇形、时间和水平位...';
  resetAiReportState('图表已更新。如需结合大模型生成报告，请点击“AI 分析报告”。');
  const {history,analysis}=await loadData(query);
  analysisCache=analysis;
  const candles=history.candles.map((item)=>({time:item.timestamp,open:item.open,high:item.high,low:item.low,close:item.close}));
  const volumes=history.candles.map((item)=>({time:item.timestamp,value:item.volume,color:item.close>=item.open?'rgba(31, 209, 138, 0.5)':'rgba(255, 91, 110, 0.5)'}));
  latestContext={query,history,report:analysis.report,security:history.security,market:history.market};restoreDrawingsState([]);
  candleSeries.setData(candles);volumeSeries.setData(volumes);renderOverlays(history,analysis.report);chart.timeScale().fitContent();ensureFutureSpace();
  securityName.textContent=history.security.name;
  securityMeta.textContent=`${history.security.code}.${history.market} · ${query.period==='daily'?'日线':query.period==='weekly'?'周线':'月线'}`;
  renderMetricList(priceLevelsEl,analysis.report.priceLevels.slice(0,8),(item)=>({name:item.label,value:item.value.toFixed(2)}));
  renderMetricList(timeCyclesEl,analysis.report.timeCycles,(item)=>({name:`${item.cycle}周期`,value:`${item.date} / ${item.close}`}));
  renderSummary(analysis.report.summary);setForecast(analysis.report);renderGuide(history,analysis.report);
  renderSquareOfNine(analysis.report);renderWheelOf24(analysis.report);
  syncOverlayButtons();syncToolButtons();updateDrawingHint();resizeDrawingLayer();updateFullscreenButton();
  document.dispatchEvent(new CustomEvent('gann:context-updated',{detail:{symbol:history.security.code,market:history.market,name:history.security.name,period:query.period,adjusted:query.adjusted}}));
}

async function generateAiReport(){
  const query=latestContext?.query||getCurrentQuery();
  const llm=readLlmConfig();
  saveLlmConfig();openAiModal();generateAiReportBtn.disabled=true;exportAiPdfBtn.disabled=true;generateAiReportBtn.textContent='生成中...';
  aiReportTitleEl.textContent=`${latestContext?.history?.security?.name||query.symbol} AI 江恩分析报告`;
  aiReportSubtitleEl.textContent='正在调用模型...';aiReportContentEl.textContent='正在调用 OpenAI 兼容接口，请稍候...';setAiReportMeta('LLM 正在生成报告');statusText.textContent='正在生成 AI 江恩分析报告...';
  try{
    const response=await fetch('/api/ai-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...query,llm})});
    const payload=await readJsonResponse(response);
    if(!payload.ok) throw new Error(payload.message||'生成 AI 报告失败。');
    renderAiReport(payload.ai);statusText.textContent='AI 报告已生成，可结合图表与价格位交叉验证。';document.dispatchEvent(new CustomEvent('gann:ai-report-saved',{detail:{symbol:payload.ai.symbol||query.symbol,id:payload.ai.id||null}}));
  }catch(error){
    currentAiReport=null;aiReportSubtitleEl.textContent='生成失败';aiReportContentEl.textContent=error.message;setAiReportMeta('生成失败');statusText.textContent='AI 报告生成失败，请检查 Base URL、Model、API Key 或稍后重试。';
  }finally{generateAiReportBtn.disabled=false;generateAiReportBtn.textContent='生成 AI 报告';}
}
async function exportAiReportPdf(){
  if(!currentAiReport) return;
  exportAiPdfBtn.disabled=true;exportAiPdfBtn.textContent='导出中...';
  let exportStage;
  try{
    exportStage=buildPdfExportStage();
    const canvas=await html2canvas(exportStage,{backgroundColor:'#07131f',scale:2,useCORS:true,width:exportStage.scrollWidth,height:exportStage.scrollHeight,windowWidth:exportStage.scrollWidth,windowHeight:exportStage.scrollHeight});
    const pdf=canvasToPagedPdf(canvas);
    const fileSymbol=currentAiReport?.symbol||latestContext?.history?.security?.code||'report';
    pdf.save(`${fileSymbol}-gann-ai-report.pdf`);
    statusText.textContent='AI 报告已导出为完整 PDF。';
  }catch(error){statusText.textContent=`PDF 导出失败：${error.message}`;}finally{
    if(exportStage) exportStage.remove();
    exportAiPdfBtn.disabled=!currentAiReport;exportAiPdfBtn.textContent='导出 PDF';
  }
}

function attachEvents(){
  overlayButtons.forEach((button)=>button.addEventListener('click',()=>toggleOverlay(button.dataset.overlay)));
  toolButtons.forEach((button)=>button.addEventListener('click',()=>{
    const tool=button.dataset.tool;
    if(tool==='undo'){undoDrawing();return;}
    if(tool==='clear'){clearDrawings();return;}
    setDrawMode(tool);
  }));
  drawingLayer.addEventListener('pointerdown',handleDrawingClick);
  drawingLayer.addEventListener('pointermove',handleDrawingMove);
  drawingLayer.addEventListener('pointerleave',handleDrawingLeave);
  [llmBaseUrlInput,llmModelInput,llmApiKeyInput,llmTemperatureInput,llmSystemPromptInput].forEach((input)=>{input.addEventListener('change',saveLlmConfig);input.addEventListener('blur',saveLlmConfig);});
  [openAiModalBtn,quickAiBtn].forEach((button)=>button.addEventListener('click',openAiModal));
  if(openGannModalBtn)openGannModalBtn.addEventListener('click',()=>{
    if(!analysisCache) return alert('分析尚未加载完成');
    gannModal.classList.add('is-open');
    gannModal.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
    renderSquareOfNine(analysisCache.report);
    renderWheelOf24(analysisCache.report);
  });
  if(closeGannModalBtn)closeGannModalBtn.addEventListener('click',()=>{
    gannModal.classList.remove('is-open');
    gannModal.setAttribute('aria-hidden','true');
    document.body.classList.remove('modal-open');
  });
  gannModal.addEventListener('click',(event)=>{if(event.target.dataset.closeModal==='true'){
    gannModal.classList.remove('is-open');
    gannModal.setAttribute('aria-hidden','true');
    document.body.classList.remove('modal-open');
  }});

  toggleFullscreenBtn.addEventListener('click',()=>{toggleChartFullscreen().catch((error)=>{statusText.textContent=`全屏切换失败：${error.message}`;});});
  closeAiModalBtn.addEventListener('click',closeAiModal);
  aiModal.addEventListener('click',(event)=>{if(event.target.dataset.closeModal==='true') closeAiModal();});
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'){
      if(aiModal.classList.contains('is-open')) closeAiModal();
      if(gannModal.getAttribute('aria-hidden')==='false'){
        gannModal.classList.remove('is-open');
        gannModal.setAttribute('aria-hidden','true');
        document.body.classList.remove('modal-open');
      }
    }
  });
  generateAiReportBtn.addEventListener('click',()=>{generateAiReport().catch((error)=>{aiReportContentEl.textContent=error.message;setAiReportMeta('生成失败');});});
  exportAiPdfBtn.addEventListener('click',()=>{exportAiReportPdf().catch((error)=>{statusText.textContent=`PDF 导出失败：${error.message}`;});});
  controlForm.addEventListener('submit',async(event)=>{
    event.preventDefault();
    try{await render(getCurrentQuery());}
    catch(error){trendBias.textContent='加载失败';trendBias.className='hero-value neutral';forecastText.textContent=error.message;statusText.textContent='分析加载失败，请检查股票代码或稍后重试。';}
  });
}

async function boot(){
  createChart();attachEvents();syncOverlayButtons();setDrawMode('crosshair');updateFullscreenButton();
  await loadLlmDefaults();resetAiReportState();await render(getCurrentQuery());
}

boot().catch((error)=>{trendBias.textContent='加载失败';trendBias.className='hero-value neutral';forecastText.textContent=error.message;statusText.textContent='初始化失败，请稍后重试。';});





function showStoredAiReport(record){
  renderAiReport({
    id: record.id,
    provider: record.provider,
    model: record.model,
    temperature: record.temperature,
    content: record.content,
    generatedAt: record.generatedAt,
    symbol: record.symbol,
    market: record.market,
    securityName: record.name,
    period: record.period,
    adjusted: record.adjusted
  });
  openAiModal();
}

window.gannApp={
  openAiModal,
  closeAiModal,
  showStoredAiReport,
  loadSymbol:async(symbol)=>{symbolInput.value=String(symbol||'').trim();await render(getCurrentQuery());},
  getCurrentSymbol:()=>latestContext?.history?.security?.code||symbolInput.value.trim(),
  getLatestContext:()=>latestContext,
  getDrawings:()=>snapshotDrawings(),
  restoreDrawings:(nextDrawings)=>restoreDrawingsState(nextDrawings)
};



