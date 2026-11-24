// Optional local browser smoke test using Chrome DevTools protocol; no test dependency.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const vite = spawn('npm', ['run', 'dev:demo', '--', '--port', '4179', '--strictPort'], { cwd: new URL('../', import.meta.url).pathname, stdio: 'ignore', detached: true })
const closeVite = () => { try { process.kill(-vite.pid, 'SIGKILL') } catch {} }
process.on('exit', closeVite)
const port = 9245
const processChrome = spawn(chrome, ['--headless=new','--no-first-run','--disable-extensions','--disable-gpu','--remote-allow-origins=*', '--remote-debugging-port='+port, '--user-data-dir=/tmp/qingyu-smoke-'+process.pid, '--window-size=1380,1000','about:blank'], { stdio:'ignore' })
process.on('exit', () => processChrome.kill('SIGKILL'))
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms))
async function targets() {
  for(let i=0;i<90;i++){
    try {const items=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json(); const target=items.find(t=>t.type==='page');if(target) return target } catch {}
    await wait(200)
  }
  throw Error('Chrome DevTools not ready')
}
let seq=0
const pending=new Map()
try{
  const target=await targets()
  const ws=new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject})
  ws.onmessage=e=>{const data=JSON.parse(e.data); if(data.id && pending.has(data.id)){ const pair=pending.get(data.id);pending.delete(data.id);if(data.error)pair.reject(Error(JSON.stringify(data.error)));else pair.resolve(data.result) }}
  function command(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})}
  async function evalJS(expression) {
    const r=await command('Runtime.evaluate',{expression, returnByValue:true, awaitPromise:true})
    if(r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
  async function untilJS(expression){for(let i=0;i<110;i++){if(await evalJS(expression))return; await wait(100)} throw Error('Page waiting timed out: '+expression + ' :: ' + JSON.stringify(await evalJS("({url:location.href,body:document.body?.innerText.slice(0,700),html:document.querySelector('#app')?.innerHTML.slice(0,400)})")))}
  await command('Page.enable')
  await command('Runtime.enable')
  await command('Page.navigate',{url:'http://127.0.0.1:4179/#/node/1'})
  await untilJS("!!document.querySelector('.node-detail-page') && !!document.querySelector('.detail-ping-networks')")
  await wait(700)
  // Smooth switch changes only the ping-chart geometry; reload retains the choice.
  await evalJS("document.querySelector('.ping-more-menu') || document.querySelector('.ping-more-button')?.click()")
  const smoothSelector = 'input[aria-label="平滑显示延迟曲线"]'
  const readPingGeometry = "() => document.querySelector('#ping-history-title')?.closest('.detail-history')?.querySelector('.detail-chart svg path[stroke]')?.getAttribute('d')"
  const readResourceGeometry = "() => [...document.querySelectorAll('.detail-history:not(.detail-ping-history) svg path[stroke]')].map(path => path.getAttribute('d'))"
  await untilJS("document.querySelectorAll('.detail-chart-grid .chart-svg').length === 4")
  const resourceBefore = await evalJS(`(${readResourceGeometry})()`)
  const networkValuesBefore = await evalJS("document.querySelector('.detail-ping-networks').innerText")
  const switchBefore = await evalJS(`({checked:document.querySelector('${smoothSelector}')?.checked,d:(${readPingGeometry})()})`)
  if (switchBefore.checked !== false || switchBefore.d.includes('C')) throw Error('Default ping line mode should be angular: ' + JSON.stringify(switchBefore))
  await evalJS(`document.querySelector('${smoothSelector}').click()`)
  await untilJS(`document.querySelector('${smoothSelector}')?.checked && (${readPingGeometry})()?.includes('C')`)
  const smoothDrawing = await evalJS("[...document.querySelectorAll('.detail-ping-history svg path[stroke]')].map(path => ({ d: path.getAttribute('d'), dash: path.getAttribute('stroke-dasharray') }))")
  if (smoothDrawing.length !== 3 || smoothDrawing.some(path => path.dash || !path.d.includes('C'))) throw Error('Smooth lines should use continuous solid curves: ' + JSON.stringify(smoothDrawing))
  if (JSON.stringify(await evalJS(`(${readResourceGeometry})()`)) !== JSON.stringify(resourceBefore)) throw Error('Ping smoothing changed resource charts')
  if (await evalJS("document.querySelector('.detail-ping-networks').innerText") !== networkValuesBefore) throw Error('Ping smoothing changed measured network values')
  await evalJS("document.querySelector('.detail-ping-history').scrollIntoView({block:'start'})")
  await wait(150)
  const smoothShot = await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/qingyu-ping-smooth.png',Buffer.from(smoothShot.data,'base64'))
  await command('Page.navigate',{url:'http://127.0.0.1:4179/#/node/1'})
  await untilJS("!!document.querySelector('.node-detail-page') && !!document.querySelector('.detail-ping-networks')")
  await evalJS("document.querySelector('.ping-more-menu') || document.querySelector('.ping-more-button')?.click()")
  await untilJS(`document.querySelector('${smoothSelector}')?.checked && (${readPingGeometry})()?.includes('C')`)
  await evalJS(`document.querySelector('${smoothSelector}').click()`)
  await untilJS(`!document.querySelector('${smoothSelector}')?.checked && !(${readPingGeometry})()?.includes('C')`)
  if (await evalJS(`(${readPingGeometry})()`) !== switchBefore.d) throw Error('Disabling smoothing did not restore original line geometry')
  function checkChartAxes(metrics, label) {
    if (Math.abs(metrics.svgWidth - metrics.viewBoxWidth) > 2 || metrics.svgHeight > 450 || metrics.svgHeight < 205 ||
        metrics.axisFont > 12 || metrics.axisHeight > 15 || metrics.labelCollision || metrics.xLabels < 3 ||
        metrics.overflow) throw Error(label + ' axes failed visual bounds checks: ' + JSON.stringify(metrics))
  }
  const chartAxesJS = `(() => {
    const chart = document.querySelector('.detail-ping-history .chart-svg')
    const axis = chart.querySelector('.chart-axis-x')
    const labels = [...chart.querySelectorAll('.chart-axis-x')].map(el => el.getBoundingClientRect())
    const bounds = chart.getBoundingClientRect()
    return {
      svgWidth: bounds.width, svgHeight: bounds.height, viewBoxWidth: chart.viewBox.baseVal.width,
      axisFont: parseFloat(getComputedStyle(axis).fontSize), axisHeight: axis.getBoundingClientRect().height,
      xLabels: labels.length, labelCollision: labels.some((box, index) => index > 0 && labels[index - 1].right > box.left + 2),
      yLabels: [...chart.querySelectorAll('.chart-axis-y')].map(el => el.textContent),
      overflow: document.documentElement.scrollWidth > innerWidth
    }
  })()`
  const desktopAxes = await evalJS(chartAxesJS)
  checkChartAxes(desktopAxes, 'Desktop')
  await command('Emulation.setDeviceMetricsOverride',{width:1880,height:1050,deviceScaleFactor:1,mobile:false})
  await wait(250)
  const wideAxes = await evalJS(chartAxesJS)
  checkChartAxes(wideAxes, 'Wide desktop')
  await evalJS("document.querySelector('.detail-ping-history').scrollIntoView({block:'start'})")
  await wait(150)
  const wideShot = await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/qingyu-chart-axes-wide.png',Buffer.from(wideShot.data,'base64'))
  await command('Emulation.clearDeviceMetricsOverride')
  await wait(200)
  await evalJS("document.querySelector('.detail-ping-history').scrollIntoView({block:'start'})")
  await wait(180)
  const networkShot = await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/qingyu-chart-axes-desktop.png',Buffer.from(networkShot.data,'base64'))
  const quota = await evalJS(`(() => {
    const box = document.querySelector('.detail-traffic-quota')
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    const toBytes = text => { const [value, unit] = text.split(' '); return Number(value) * 1024 ** units.indexOf(unit) }
    const [used, limit] = box.querySelector('strong').textContent.split(' / ').map(toBytes)
    return { ratio: used / limit * 100,
      label: parseFloat(box.querySelector('.detail-quota-pct').textContent),
      width: parseFloat(box.querySelector('.detail-kpi-progress > span').style.width) }
  })()`)
  if (!Number.isFinite(quota.ratio) || Math.abs(quota.ratio - quota.label) > .1 || Math.abs(Math.min(100, quota.ratio) - quota.width) > .1) {
    throw Error('Quota display and progress disagree: ' + JSON.stringify(quota))
  }
  const fillCounts = await evalJS("[...document.querySelectorAll('.detail-chart svg')].map(svg => [svg.querySelectorAll('.chart-area').length, svg.querySelectorAll('path[stroke]:not([stroke-dasharray])').length, [...svg.querySelectorAll('.chart-area')].every(el => !!document.getElementById(el.getAttribute('fill').slice(5, -1)))])")
  if (fillCounts.length !== 5 || fillCounts.some(([area, line, gradients]) => area !== line || !gradients)) {
    throw Error('Area fill missing or applied to a dashed series: ' + JSON.stringify(fillCounts))
  }
  // Ensure axis labels remain legible at the new four-column breakpoint and on narrow phones.
  await evalJS("document.querySelector('[aria-label=\"资源趋势时间范围\"]').value = '168'; document.querySelector('[aria-label=\"资源趋势时间范围\"]').dispatchEvent(new Event('change', {bubbles:true}))")
  await untilJS("document.querySelector('.detail-chart-grid .chart-axis-x')?.textContent.includes('/')")
  for (const width of [320, 390, 480, 481, 640, 641, 900, 901, 1024, 1025, 1080, 1081, 1380, 1880]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    await untilJS("[...document.querySelectorAll('.detail-chart svg')].every(el => Math.abs(el.viewBox.baseVal.width - el.getBoundingClientRect().width) < 1)")
    const layout = await evalJS(`(() => {
      const charts = [...document.querySelectorAll('.detail-chart svg')]
      const labelsOverlap = charts.some(chart => {
        const labels = [...chart.querySelectorAll('.chart-axis-x')].map(node => node.getBoundingClientRect())
        return labels.some((rect, index) => index && labels[index - 1].right > rect.left + 1)
      })
      const quality = document.querySelector('.ping-quality-table')
      const hasQuota = !!document.querySelector('.detail-quota-pct')
      return { labelsOverlap, overflow: document.documentElement.scrollWidth > innerWidth, qualityOverflow: quality.scrollWidth > quality.clientWidth + 1, hasQuota }
    })()`)
    if (layout.labelsOverlap || layout.overflow || layout.qualityOverflow || !layout.hasQuota) {
      throw Error('Detail layout invalid at ' + width + 'px: ' + JSON.stringify(layout))
    }
  }
  await command('Emulation.clearDeviceMetricsOverride')
  const initial=await evalJS("({title:document.querySelector('.detail-identity h1')?.innerText,charts:document.querySelectorAll('.detail-chart').length,resourceLines:document.querySelectorAll('.detail-chart svg path[stroke]').length,body:document.querySelector('.node-detail-page')?.innerText.slice(0,600),overflow:document.documentElement.scrollWidth>innerWidth})")
  if(!initial.title || initial.charts!==5 || initial.overflow)throw Error('Desktop invalid '+JSON.stringify(initial))
  const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/qingyu-cdp-desktop.png',Buffer.from(shot.data,'base64'))
  await evalJS("document.querySelector('.detail-page-switch button:last-of-type').click()")
  await untilJS("location.hash === '#/node/2'")
  const navigated=await evalJS("document.querySelector('.detail-identity h1')?.innerText")
  if(!navigated)throw Error('Node switch failed')
  await command('Page.navigate',{url:'http://127.0.0.1:4179/?smoke=1'})
  await untilJS("document.querySelectorAll('.node-card').length > 3")
  const cardsBefore = await evalJS(`(() => {
    const cards = [...document.querySelectorAll('.nodes-grid .node-card')]
    const row = cards.slice(0, 5)
    const firstTop = cards[0]?.getBoundingClientRect().top ?? 0
    const pingRows = row.flatMap(card => [...card.querySelectorAll('.ping-panels .ping-panel-row')])
    const geoMap = document.querySelector('.geo-map')
    const regionRows = [...document.querySelectorAll('.geo-region-row')]
    return { count: cards.length, links: document.querySelectorAll('.node-open-link').length,
      visibleText: cards[0]?.innerText.includes('查看详情'),
      cardsPerRow: cards.filter(card => Math.abs(card.getBoundingClientRect().top - firstTop) <= 2).length,
      extraCount: document.querySelectorAll('.node-card .node-extra').length,
      chipsCount: row.filter(card => card.querySelectorAll('.node-card-chips > span').length >= 1).length,
      pingCols: row.map(card => card.querySelectorAll('.ping-panels .ping-panel-row').length),
      pingOverflow: pingRows.some(el => el.scrollWidth > el.clientWidth + 1),
      geoPills: document.querySelectorAll('.geo-marker-pill').length,
      geoRows: regionRows.length,
      geoClipped: (() => {
        const listBox = document.querySelector('.geo-region-list')?.getBoundingClientRect()
        return !listBox || regionRows.some(el => {
          const r = el.getBoundingClientRect()
          return r.height < 18 || r.top < listBox.top - 1 || r.bottom > listBox.bottom + 1
        })
      })(),
      geoOverflow: !!geoMap && (geoMap.scrollWidth > geoMap.clientWidth + 1 || regionRows.some(el => el.scrollWidth > el.clientWidth + 1)),
      footers: row.map(card => ({ y: Math.round(card.querySelector('.node-card-footer')?.getBoundingClientRect().bottom ?? -1) })) }
  })()`)
  if(cardsBefore.links || cardsBefore.visibleText || cardsBefore.count < 5) throw Error('Card detail CTA still shown: ' + JSON.stringify(cardsBefore))
  if(cardsBefore.cardsPerRow !== 5 || cardsBefore.extraCount || cardsBefore.chipsCount !== 5 || !cardsBefore.pingCols.every(count => count === 2) || cardsBefore.pingOverflow) throw Error('Card chips/ping cols invalid: ' + JSON.stringify(cardsBefore))
  if(cardsBefore.geoPills < 1 || cardsBefore.geoRows !== 5 || cardsBefore.geoClipped || cardsBefore.geoOverflow) throw Error('GeoMap layout invalid: ' + JSON.stringify(cardsBefore))
  const moreBefore = await evalJS("document.querySelector('.geo-more-btn')?.innerText")
  if (!moreBefore || !moreBefore.includes('另外 5 个地区')) throw Error('GeoMap more button missing: ' + JSON.stringify(moreBefore))
  await evalJS("document.querySelector('.geo-more-btn')?.click()")
  await untilJS("document.querySelector('.geo-more-btn')?.innerText.includes('返回前 5 个地区')")
  const page2 = await evalJS("(() => { const listBox = document.querySelector('.geo-region-list').getBoundingClientRect(); const rows = [...document.querySelectorAll('.geo-region-row')]; return { count: rows.length, clipped: rows.some(el => { const r = el.getBoundingClientRect(); return r.height < 18 || r.top < listBox.top - 1 || r.bottom > listBox.bottom + 1 }) } })()")
  if (page2.count !== 5 || page2.clipped) throw Error('GeoMap page 2 rows invalid: ' + JSON.stringify(page2))
  await evalJS("document.querySelector('.geo-more-btn')?.click()")
  await untilJS("document.querySelector('.geo-more-btn')?.innerText.includes('另外 5 个地区')")
  const footerBottom = cardsBefore.footers.map(item => item.y).filter(y => y > 0)
  if(footerBottom.length >= 2 && Math.max(...footerBottom)-Math.min(...footerBottom) > 3) throw Error('Card footer rows not level: ' + JSON.stringify(cardsBefore))
  await evalJS("document.querySelector('.nodes-grid .node-card').scrollIntoView({block:'start'})")
  await wait(250)
  const cardShot = await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/qingyu-card-after.png',Buffer.from(cardShot.data,'base64'))
  await evalJS("document.querySelector('.node-card .node-resources').click()")
  await untilJS("location.hash === '#/node/1'")
  await command('Page.navigate',{url:'http://127.0.0.1:4179/?smoke=1'})
  await untilJS("document.querySelectorAll('.node-card').length > 3")
  await evalJS("history.pushState({}, '', '/?from-list=1')")
  await evalJS("window.scrollTo(0,480); document.querySelector('.node-card-header a').click()")
  await untilJS("location.hash === '#/node/1'")
  await evalJS('history.back()')
  await untilJS("!location.hash && !!document.querySelector('.node-card')")
  await wait(200)
  const restored=await evalJS("({scroll:window.scrollY,focus:document.activeElement?.getAttribute('data-node-entry')})")
  if(restored.scroll<300 || restored.focus!=='1')throw Error('Back/scroll/focus restore failed '+JSON.stringify(restored))
  await command('Page.navigate',{url:'http://127.0.0.1:4179/#/node/1'})
  await untilJS("document.querySelector('.node-detail-page')")
  await command('Emulation.setDeviceMetricsOverride',{width:320,height:860,deviceScaleFactor:2,mobile:true})
  await wait(500)
  const mobile=await evalJS("({vw:innerWidth,page:document.documentElement.scrollWidth,chart:document.querySelector('.detail-chart')?.getBoundingClientRect().width})")
  if(mobile.page>mobile.vw+1)throw Error('Mobile horizontal overflow '+JSON.stringify(mobile))
  await untilJS("Math.abs(document.querySelector('.detail-ping-history .chart-svg').viewBox.baseVal.width - document.querySelector('.detail-ping-history .chart-svg').getBoundingClientRect().width) < 2")
  const mobileAxes = await evalJS(chartAxesJS)
  checkChartAxes(mobileAxes, 'Mobile')
  const mobileQuality = await evalJS(`(() => {
    const table = document.querySelector('.ping-quality-table')
    const rows = [...document.querySelectorAll('.ping-quality-row')]
    return {
      rows: rows.length,
      metrics: rows.every(row => row.querySelectorAll('.ping-quality-metrics > span').length === 4),
      cards: rows.every(row => getComputedStyle(row).gridTemplateColumns.split(' ').length === 1),
      tableOverflow: !!table && table.scrollWidth > table.clientWidth + 1,
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
    }
  })()`)
  if (mobileQuality.rows < 1 || !mobileQuality.metrics || !mobileQuality.cards || mobileQuality.tableOverflow || mobileQuality.pageOverflow) {
    throw Error('Mobile ping quality layout failed: ' + JSON.stringify(mobileQuality))
  }
  await evalJS("document.querySelector('.detail-ping-history').scrollIntoView({block:'start'})")
  await wait(150)
  const networkMobileShot = await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/qingyu-chart-axes-mobile.png',Buffer.from(networkMobileShot.data,'base64'))
  const shot2=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/qingyu-cdp-mobile.png',Buffer.from(shot2.data,'base64'))
  await command('Page.navigate',{url:'http://127.0.0.1:4179/?mobile-card=1'})
  await untilJS("document.querySelectorAll('.node-card').length > 3 && document.querySelectorAll('.geo-region-row').length > 0")
  const mobileCards = await evalJS("({pageWidth:document.documentElement.scrollWidth,viewWidth:innerWidth,hasCTA:document.querySelector('.node-open-link') !== null,footer:!!document.querySelector('.node-card-footer'),geoOverflow:(() => { const g = document.querySelector('.geo-map'); return !g || g.scrollWidth > g.clientWidth + 1 })()})")
  if(mobileCards.pageWidth > mobileCards.viewWidth + 1 || mobileCards.hasCTA || !mobileCards.footer || mobileCards.geoOverflow) throw Error('Mobile cards invalid '+JSON.stringify(mobileCards))
  await evalJS("document.querySelector('.node-card').scrollIntoView({block:'start'})")
  const shot3=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/qingyu-card-mobile-after.png',Buffer.from(shot3.data,'base64'))
  await evalJS("localStorage.setItem('qingyu.preferences', JSON.stringify({theme:'dark', display:{show_node_metadata:false, show_traffic:false}}))")
  await command('Page.navigate',{url:'http://127.0.0.1:4179/?metadata-hidden=1#/node/1'})
  await untilJS("document.querySelector('.detail-kpi-badge')?.textContent === '实时' && document.documentElement.classList.contains('dark')")
  if (await evalJS("!!document.querySelector('.detail-traffic-quota') || document.querySelector('.detail-bottom-grid').innerText.includes('CPU 核心')")) {
    throw Error('Detail still shows hidden node metadata or traffic quota')
  }
  console.log(JSON.stringify({passed:true,initial,desktopAxes,wideAxes,mobileAxes,navigated,mobile,mobileCards,cardsBefore},null,2))
  ws.close()
} catch(error){console.error(error);process.exitCode=1}
finally {processChrome.kill('SIGKILL'); closeVite()}
