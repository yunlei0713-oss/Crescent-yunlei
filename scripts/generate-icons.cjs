#!/usr/bin/env node
// One approved mountain/river master; no baked mask, border, glow or lettering.
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const root = path.resolve(__dirname, '..')
const master = path.join(root, 'Document/new/brand/source/moxun-mountain-river-master.png')

// Tahoe normalizes the native icon to its own Dock tile. Transparent margins around
// sharp-cornered artwork trigger a second inset and a gray backing plate.
// Supply edge-to-edge artwork; let macOS apply its own size, corners and effects.
function renderMacIcon(size, source = master) {
  return sharp(source)
    .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer()
}

// PNG-backed ICNS representations, including Retina sizes; works offline on any host.
function icns(images) {
  const representations = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
    ['ic11', 32],
    ['ic12', 64],
    ['ic13', 256],
    ['ic14', 512]
  ]
  const chunks = representations.map(([type, size]) => {
    const png = images.get(size)
    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(8 + png.length, 4)
    return Buffer.concat([header, png])
  })
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4)
  return Buffer.concat([header, ...chunks])
}

function ico(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = 6 + 16 * entries.length
  const directories = entries.map(({ size, png }) => {
    const entry = Buffer.alloc(16)
    entry[0] = entry[1] = size === 256 ? 0 : size
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += png.length
    return entry
  })
  return Buffer.concat([header, ...directories, ...entries.map(({ png }) => png)])
}

async function generateIcons() {
  const render = (size) =>
    sharp(master)
      .resize(size, size, { fit: 'cover', kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toBuffer()
  const write = (name, bytes) => {
    const target = path.join(root, name)
    // Generated assets always come from the approved master. Do not archive
    // replaced icons: retired Crescent artwork must not return on regeneration.
    if (fs.existsSync(target) && fs.readFileSync(target).equals(bytes)) return
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, bytes)
  }
  const app = await render(1024)
  write('build/icon.png', app)
  write('resources/icon.png', app)
  write('src/renderer/src/assets/moxun-mark.png', await render(128))
  write('src/renderer/src/assets/moxun-logo.png', await render(512))
  const entries = []
  for (const size of [16, 24, 32, 48, 64, 128, 256]) entries.push({ size, png: await render(size) })
  write('build/icon.ico', ico(entries))
  write('website/docs/public/favicon.ico', ico(entries))
  for (const size of [16, 32, 64, 128, 256, 512, 1024])
    write(`build/icons/preview/icon-${size}.png`, await render(size))
  const iconset = 'build/icons/MoXun.iconset'
  const macImages = new Map()
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    const image = await renderMacIcon(size)
    macImages.set(size, image)
    write(`build/icons/preview/macos-icon-${size}.png`, image)
  }
  for (const size of [16, 32, 128, 256, 512]) {
    write(`${iconset}/icon_${size}x${size}.png`, macImages.get(size))
    write(`${iconset}/icon_${size}x${size}@2x.png`, macImages.get(size * 2))
  }
  write('build/icon.icns', icns(macImages))
  console.log('MoXun icons generated from the approved mountain/river master.')
}

module.exports = { generateIcons, renderMacIcon }
if (require.main === module)
  generateIcons().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
