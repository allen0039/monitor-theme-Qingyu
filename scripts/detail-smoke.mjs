// Optional local browser smoke test using Chrome DevTools protocol; no test dependency.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const vite = spawn('npm', ['run', 'dev:demo', '--', '--port', '4179', '--strictPort'], { cwd: new URL('../', import.meta.url).pathname, stdio: 'ignore', detached: true })
const closeVite = () => { try { process.kill(-vite.pid, 'SIGKILL') } catch {} }
process.on('exit', closeVite)
const port = 9245
const processChrome = spawn(chrome, ['--headless=new','--no-first-run','--disable-extensions','--disable-gpu','--remote-allow-origins=*', '--remote-debugging-port='+port, '--user-data-dir=/tmp/boxpro-smoke-'+process.pid, '--window-size=1380,1000','about:blank'], { stdio:'ignore' })
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
  const smoothSelector = 'input[aria-label="平滑显示延迟曲线"]'
  const readPingGeometry = "() => document.querySelector('#ping-history-title')?.closest('.detail-history')?.querySelector('.detail-chart svg path[stroke]')?.getAttribute('d')"
  const switchBefore = await evalJS(`({checked:document.querySelector('${smoothSelector}')?.checked,d:(${readPingGeometry})()})`)
  if (switchBefore.checked !== false || switchBefore.d.includes('C')) throw Error('Default ping line mode should be angular: ' + JSON.stringify(switchBefore))
  await evalJS(`document.querySelector('${smoothSelector}').click()`)
  await untilJS(`document.querySelector('${smoothSelector}')?.checked && (${readPingGeometry})()?.includes('C')`)
  await command('Page.navigate',{url:'http://127.0.0.1:4179/#/node/1'})
  await untilJS(`document.querySelector('${smoothSelector}')?.checked && (${readPingGeometry})()?.includes('C')`)
  await evalJS(`document.querySelector('${smoothSelector}').click()`)
  await untilJS(`!document.querySelector('${smoothSelector}')?.checked && !(${readPingGeometry})()?.includes('C')`)
  function checkChartAxes(metrics, label) {
    if (Math.abs(metrics.svgWidth - metrics.viewBoxWidth) > 2 || metrics.svgHeight > 330 || metrics.svgHeight < 205 ||
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
  writeFileSync('/tmp/boxpro-chart-axes-wide.png',Buffer.from(wideShot.data,'base64'))
  await command('Emulation.clearDeviceMetricsOverride')
  await wait(200)
  await evalJS("document.querySelector('.detail-ping-history').scrollIntoView({block:'start'})")
  await wait(180)
  const networkShot = await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/boxpro-chart-axes-desktop.png',Buffer.from(networkShot.data,'base64'))
  const initial=await evalJS("({title:document.querySelector('.detail-identity h1')?.innerText,charts:document.querySelectorAll('.detail-chart').length,resourceLines:document.querySelectorAll('.detail-chart svg path[stroke]').length,body:document.querySelector('.node-detail-page')?.innerText.slice(0,600),overflow:document.documentElement.scrollWidth>innerWidth})")
  if(!initial.title || initial.charts!==5 || initial.overflow)throw Error('Desktop invalid '+JSON.stringify(initial))
  const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/boxpro-cdp-desktop.png',Buffer.from(shot.data,'base64'))
  await evalJS("document.querySelector('.detail-page-switch button:last-of-type').click()")
  await untilJS("location.hash === '#/node/2'")
  const navigated=await evalJS("document.querySelector('.detail-identity h1')?.innerText")
  if(!navigated)throw Error('Node switch failed')
  await command('Page.navigate',{url:'http://127.0.0.1:4179/?smoke=1'})
  await untilJS("document.querySelectorAll('.node-card').length > 3")
  const cardsBefore = await evalJS(`(() => {
    const cards = [...document.querySelectorAll('.nodes-grid .node-card')]
    const row = cards.slice(0, 3)
    return { count: cards.length, links: document.querySelectorAll('.node-open-link').length,
      visibleText: cards[0]?.innerText.includes('查看详情'),
      footers: row.map(card => ({ y: Math.round(card.querySelector('.node-card-footer')?.getBoundingClientRect().bottom ?? -1),
        tagCenter: (() => { const rect = card.querySelector('.remark-tags')?.getBoundingClientRect(); return rect ? rect.y + rect.height / 2 : null })(),
        menuCenter: (() => { const rect = card.querySelector('.node-extra summary')?.getBoundingClientRect(); return rect ? rect.y + rect.height / 2 : null })() })) }
  })()`)
  if(cardsBefore.links || cardsBefore.visibleText || cardsBefore.count < 3) throw Error('Card detail CTA still shown: ' + JSON.stringify(cardsBefore))
  const footerBottom = cardsBefore.footers.map(item => item.y).filter(y => y > 0)
  if(footerBottom.length >= 2 && Math.max(...footerBottom)-Math.min(...footerBottom) > 3) throw Error('Card footer rows not level: ' + JSON.stringify(cardsBefore))
  for(const footer of cardsBefore.footers) {
    if(footer.tagCenter !== null && footer.menuCenter !== null && Math.abs(footer.tagCenter - footer.menuCenter) > 9) throw Error('Tags/menu not inline: ' + JSON.stringify(cardsBefore))
  }
  await evalJS("document.querySelector('.nodes-grid .node-card').scrollIntoView({block:'start'})")
  await wait(250)
  const cardShot = await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/boxpro-card-after.png',Buffer.from(cardShot.data,'base64'))
  const originalHash = await evalJS('location.hash')
  await evalJS("document.querySelector('.node-card .node-extra summary').click()")
  if (await evalJS('location.hash') !== originalHash) throw Error('More-info caused navigation')
  await evalJS("document.querySelector('.node-card .node-extra summary').click()")
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
  await evalJS("document.querySelector('.detail-ping-history').scrollIntoView({block:'start'})")
  await wait(150)
  const networkMobileShot = await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/boxpro-chart-axes-mobile.png',Buffer.from(networkMobileShot.data,'base64'))
  const shot2=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/boxpro-cdp-mobile.png',Buffer.from(shot2.data,'base64'))
  await command('Page.navigate',{url:'http://127.0.0.1:4179/?mobile-card=1'})
  await untilJS("document.querySelectorAll('.node-card').length > 3")
  const mobileCards = await evalJS("({pageWidth:document.documentElement.scrollWidth,viewWidth:innerWidth,hasCTA:document.querySelector('.node-open-link') !== null,footer:!!document.querySelector('.node-card-footer')})")
  if(mobileCards.pageWidth > mobileCards.viewWidth + 1 || mobileCards.hasCTA || !mobileCards.footer) throw Error('Mobile cards invalid '+JSON.stringify(mobileCards))
  await evalJS("document.querySelector('.node-card').scrollIntoView({block:'start'})")
  const shot3=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  writeFileSync('/tmp/boxpro-card-mobile-after.png',Buffer.from(shot3.data,'base64'))
  console.log(JSON.stringify({passed:true,initial,desktopAxes,wideAxes,mobileAxes,navigated,mobile,mobileCards,cardsBefore},null,2))
  ws.close()
} catch(error){console.error(error);process.exitCode=1}
finally {processChrome.kill('SIGKILL'); closeVite()}
