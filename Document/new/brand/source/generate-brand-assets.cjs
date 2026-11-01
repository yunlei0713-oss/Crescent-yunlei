const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const { execFileSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const sourceDir = path.join(root, 'source')
const iconDir = path.join(root, 'app-icons')
const iconsetDir = path.join(iconDir, 'macos', 'MoXun.iconset')
const logoDir = path.join(root, 'logos')
const faviconDir = path.join(root, 'favicon')
const themeDir = path.join(root, 'theme')
const sourcePng = path.join(sourceDir, 'moxun-mountain-river-master.png')
const ensure = (p) => fs.mkdirSync(p, { recursive: true })
;[iconDir, iconsetDir, logoDir, faviconDir, themeDir].forEach(ensure)

function icoBuffer(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  const dirs = [],
    payloads = []
  let offset = 6 + entries.length * 16
  for (const entry of entries) {
    const dir = Buffer.alloc(16)
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, 0)
    dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, 1)
    dir.writeUInt8(0, 2)
    dir.writeUInt8(0, 3)
    dir.writeUInt16LE(1, 4)
    dir.writeUInt16LE(32, 6)
    dir.writeUInt32LE(entry.png.length, 8)
    dir.writeUInt32LE(offset, 12)
    dirs.push(dir)
    payloads.push(entry.png)
    offset += entry.png.length
  }
  return Buffer.concat([header, ...dirs, ...payloads])
}

function logoSvg(dark, stacked, artData) {
  const fg = dark ? '#F4F4EF' : '#202321'
  const sub = dark ? '#C0C4BD' : '#737873'
  const font = 'PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif'
  if (!stacked) {
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="440" viewBox="0 0 1600 440">' +
      '<image href="data:image/png;base64,' +
      artData +
      '" x="55" y="35" width="370" height="370" preserveAspectRatio="xMidYMid slice"/>' +
      '<text x="500" y="205" fill="' +
      fg +
      '" font-family="' +
      font +
      '" font-size="142" font-weight="650" letter-spacing="12">墨巡</text>' +
      '<text x="510" y="285" fill="' +
      sub +
      '" font-family="Inter, Arial, sans-serif" font-size="48" font-weight="500" letter-spacing="12">MOXUN</text>' +
      '<text x="512" y="350" fill="' +
      sub +
      '" font-family="' +
      font +
      '" font-size="31" letter-spacing="4">智能运维协作台</text></svg>'
    )
  }
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1040" viewBox="0 0 900 1040">' +
    '<image href="data:image/png;base64,' +
    artData +
    '" x="150" y="55" width="600" height="600" preserveAspectRatio="xMidYMid slice"/>' +
    '<text x="450" y="790" text-anchor="middle" fill="' +
    fg +
    '" font-family="' +
    font +
    '" font-size="128" font-weight="650" letter-spacing="14">墨巡</text>' +
    '<text x="450" y="870" text-anchor="middle" fill="' +
    sub +
    '" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="500" letter-spacing="14">MOXUN</text>' +
    '<text x="450" y="940" text-anchor="middle" fill="' +
    sub +
    '" font-family="' +
    font +
    '" font-size="30" letter-spacing="5">智能运维协作台</text></svg>'
  )
}

function previewSvg(dark, artData) {
  const c = dark
    ? {
        bg: '#111312',
        panel: '#191D1A',
        panel2: '#202521',
        line: '#353B36',
        text: '#F1F2ED',
        muted: '#A6ADA4',
        soft: '#858D84',
        terminal: '#090B0A',
        terminalText: '#D9DED6',
        bubble: '#242A25',
        card: '#1D231F',
        button: '#E7E9E2',
        buttonText: '#1B201C'
      }
    : {
        bg: '#F5F5F0',
        panel: '#ECECE6',
        panel2: '#FCFCF9',
        line: '#D9DCD5',
        text: '#202421',
        muted: '#686F68',
        soft: '#899087',
        terminal: '#171A18',
        terminalText: '#E3E7DF',
        bubble: '#F0F0EA',
        card: '#FFFFFF',
        button: '#292F2B',
        buttonText: '#FFFFFF'
      }
  const font = 'PingFang SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif'
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">' +
    '<rect width="1600" height="900" fill="' +
    c.bg +
    '"/>' +
    '<rect x="0" y="0" width="1600" height="72" fill="' +
    c.panel2 +
    '"/><path d="M0 72H1600" stroke="' +
    c.line +
    '"/>' +
    '<image href="data:image/png;base64,' +
    artData +
    '" x="22" y="12" width="48" height="48"/>' +
    '<text x="86" y="48" fill="' +
    c.text +
    '" font-family="' +
    font +
    '" font-size="26" font-weight="650">墨巡</text>' +
    '<text x="1560" y="44" fill="' +
    c.muted +
    '" font-family="' +
    font +
    '" font-size="17" text-anchor="end">水墨山河 · Guided Ops</text>' +
    '<rect x="0" y="72" width="245" height="828" fill="' +
    c.panel +
    '"/><path d="M245 72V900" stroke="' +
    c.line +
    '"/>' +
    '<text x="30" y="124" fill="' +
    c.soft +
    '" font-family="' +
    font +
    '" font-size="16" letter-spacing="2">工作空间</text>' +
    '<rect x="16" y="148" width="213" height="48" rx="9" fill="' +
    c.panel2 +
    '"/>' +
    '<text x="48" y="179" fill="' +
    c.text +
    '" font-family="' +
    font +
    '" font-size="18">终端与会话</text>' +
    '<text x="30" y="244" fill="' +
    c.muted +
    '" font-family="' +
    font +
    '" font-size="17">知识库</text>' +
    '<text x="30" y="294" fill="' +
    c.muted +
    '" font-family="' +
    font +
    '" font-size="17">操作记录</text>' +
    '<text x="30" y="344" fill="' +
    c.muted +
    '" font-family="' +
    font +
    '" font-size="17">安全设置</text>' +
    '<rect x="265" y="92" width="790" height="780" rx="14" fill="' +
    c.terminal +
    '"/>' +
    '<text x="295" y="136" fill="' +
    c.terminalText +
    '" font-family="SFMono-Regular, Menlo, monospace" font-size="17">Terminal · web-prod-01</text>' +
    '<text x="295" y="210" fill="' +
    c.terminalText +
    '" font-family="SFMono-Regular, Menlo, monospace" font-size="18">$ kubectl get pods -n platform</text>' +
    '<text x="295" y="252" fill="' +
    c.terminalText +
    '" font-family="SFMono-Regular, Menlo, monospace" font-size="17">NAME                         READY   STATUS</text>' +
    '<text x="295" y="286" fill="' +
    c.terminalText +
    '" font-family="SFMono-Regular, Menlo, monospace" font-size="17">api-7b9d8c                  1/1     Running</text>' +
    '<text x="295" y="320" fill="' +
    c.terminalText +
    '" font-family="SFMono-Regular, Menlo, monospace" font-size="17">worker-6d4f                 0/1     CrashLoopBackOff</text>' +
    '<text x="295" y="390" fill="' +
    c.soft +
    '" font-family="SFMono-Regular, Menlo, monospace" font-size="16"># 命令由操作者手动输入；墨巡仅观察结果</text>' +
    '<rect x="1075" y="92" width="500" height="780" rx="14" fill="' +
    c.panel2 +
    '" stroke="' +
    c.line +
    '"/>' +
    '<text x="1110" y="142" fill="' +
    c.text +
    '" font-family="' +
    font +
    '" font-size="24" font-weight="650">排查协作</text>' +
    '<text x="1110" y="190" fill="' +
    c.muted +
    '" font-family="' +
    font +
    '" font-size="17">我发现 worker Pod 处于 CrashLoopBackOff。</text>' +
    '<text x="1110" y="220" fill="' +
    c.muted +
    '" font-family="' +
    font +
    '" font-size="17">先确认容器上一次退出原因，再决定下一步。</text>' +
    '<rect x="1100" y="270" width="450" height="270" rx="12" fill="' +
    c.card +
    '" stroke="' +
    c.line +
    '"/>' +
    '<text x="1125" y="312" fill="' +
    c.text +
    '" font-family="' +
    font +
    '" font-size="20" font-weight="650">建议步骤 01 · 查看上次退出信息</text>' +
    '<text x="1125" y="355" fill="' +
    c.muted +
    '" font-family="' +
    font +
    '" font-size="16">目的：确认容器退出原因，不修改集群状态。</text>' +
    '<rect x="1125" y="382" width="400" height="68" rx="8" fill="' +
    c.terminal +
    '"/>' +
    '<text x="1145" y="423" fill="' +
    c.terminalText +
    '" font-family="SFMono-Regular, Menlo, monospace" font-size="18">kubectl describe pod ...</text>' +
    '<text x="1125" y="490" fill="' +
    c.soft +
    '" font-family="' +
    font +
    '" font-size="15">只提供建议 · 由你手动执行</text>' +
    '<rect x="1125" y="505" width="110" height="34" rx="7" fill="' +
    c.button +
    '"/>' +
    '<text x="1180" y="528" text-anchor="middle" fill="' +
    c.buttonText +
    '" font-family="' +
    font +
    '" font-size="15">复制命令</text>' +
    '<rect x="1100" y="565" width="450" height="170" rx="12" fill="' +
    c.bubble +
    '" stroke="' +
    c.line +
    '"/>' +
    '<text x="1125" y="610" fill="' +
    c.text +
    '" font-family="' +
    font +
    '" font-size="18" font-weight="600">安全边界</text>' +
    '<text x="1125" y="650" fill="' +
    c.muted +
    '" font-family="' +
    font +
    '" font-size="16">Agent 不具备终端执行能力</text>' +
    '<text x="1125" y="682" fill="' +
    c.muted +
    '" font-family="' +
    font +
    '" font-size="16">本地文件修改必须经过人工批准</text>' +
    '<rect x="1100" y="770" width="450" height="70" rx="10" fill="' +
    c.card +
    '" stroke="' +
    c.line +
    '"/>' +
    '<text x="1125" y="812" fill="' +
    c.soft +
    '" font-family="' +
    font +
    '" font-size="17">描述问题，或拖入截图、日志和配置文件…</text></svg>'
  )
}

;(async () => {
  const src = fs.readFileSync(sourcePng)
  const artData = src.toString('base64')

  const appSizes = [1024, 512, 256, 128, 64, 32, 16]
  for (const size of appSizes) {
    await sharp(src)
      .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toFile(path.join(iconDir, 'moxun-app-icon-' + size + '.png'))
  }

  const iconset = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024]
  ]
  for (const pair of iconset) {
    const png = await sharp(src)
      .resize(pair[1], pair[1], { fit: 'cover', kernel: 'lanczos3' })
      .png()
      .toBuffer()
    await fs.promises.writeFile(path.join(iconsetDir, pair[0]), png)
  }
  const icoEntries = []
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    icoEntries.push({
      size,
      png: await sharp(src)
        .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
        .png()
        .toBuffer()
    })
  }
  await fs.promises.writeFile(path.join(iconDir, 'moxun-app-icon.ico'), icoBuffer(icoEntries))
  execFileSync('/usr/bin/iconutil', [
    '-c',
    'icns',
    iconsetDir,
    '-o',
    path.join(iconDir, 'moxun-app-icon.icns')
  ])

  for (const size of [16, 32, 48, 64, 128]) {
    await sharp(src)
      .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
      .png()
      .toFile(path.join(faviconDir, 'favicon-' + size + '.png'))
  }
  const favEntries = []
  for (const size of [16, 32, 48, 64, 128, 256]) {
    favEntries.push({ size, png: await sharp(src).resize(size, size).png().toBuffer() })
  }
  await fs.promises.writeFile(path.join(faviconDir, 'favicon.ico'), icoBuffer(favEntries))

  const logoFiles = [
    ['moxun-wordmark-light.svg', logoSvg(false, false, artData)],
    ['moxun-wordmark-dark.svg', logoSvg(true, false, artData)],
    ['moxun-stacked-light.svg', logoSvg(false, true, artData)],
    ['moxun-stacked-dark.svg', logoSvg(true, true, artData)]
  ]
  for (const pair of logoFiles) {
    const out = path.join(logoDir, pair[0])
    await fs.promises.writeFile(out, pair[1], 'utf8')
    await sharp(Buffer.from(pair[1]))
      .png()
      .toFile(out.replace(/\.svg$/, '.png'))
  }
  await sharp(src).png().toFile(path.join(logoDir, 'moxun-symbol-light.png'))
  await sharp(src).png().toFile(path.join(logoDir, 'moxun-symbol-dark.png'))

  for (const dark of [false, true]) {
    const svg = previewSvg(dark, artData)
    await sharp(Buffer.from(svg))
      .png()
      .toFile(
        path.join(themeDir, dark ? 'ink-wash-preview-dark.png' : 'ink-wash-preview-light.png')
      )
  }

  const raw = await sharp(src)
    .resize(640, 640)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const rgba = Buffer.alloc(raw.info.width * raw.info.height * 4)
  for (let i = 0; i < raw.data.length; i++) {
    const alpha = Math.round(Math.max(0, 255 - raw.data[i]) * 0.075)
    const j = i * 4
    rgba[j] = 0
    rgba[j + 1] = 0
    rgba[j + 2] = 0
    rgba[j + 3] = alpha
  }
  await sharp(rgba, { raw: { width: raw.info.width, height: raw.info.height, channels: 4 } })
    .png()
    .toFile(path.join(themeDir, 'ink-wash-watermark.png'))

  console.log('Brand assets generated successfully.')
  console.log('App PNG sizes: ' + appSizes.join(', '))
  console.log('ICNS, ICO, favicon, logo lockups and theme previews created.')
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
