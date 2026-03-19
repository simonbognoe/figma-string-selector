const esbuild = require('esbuild')
const fs = require('fs')

const isWatch = process.argv.includes('--watch')

async function buildUI() {
  const uiResult = await esbuild.build({
    entryPoints: ['src/ui/index.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    target: 'es2017',
  })

  const uiJs = uiResult.outputFiles[0].text
  const htmlTemplate = fs.readFileSync('src/ui/index.html', 'utf8')
  const htmlOut = htmlTemplate.replace('<!-- INJECT_SCRIPT -->', `<script>\n${uiJs}\n</script>`)

  fs.mkdirSync('dist', { recursive: true })
  fs.writeFileSync('dist/ui.html', htmlOut)
}

async function build() {
  await Promise.all([
    esbuild.build({
      entryPoints: ['src/code.ts'],
      bundle: true,
      outfile: 'dist/code.js',
      platform: 'browser',
      target: 'es2017',
    }),
    buildUI(),
  ])
  console.log('[build] done')
}

if (isWatch) {
  // Use esbuild watch for code.ts, and a manual rebuild for ui on changes
  const { execSync } = require('child_process')
  build().catch(console.error)

  // Simple polling watch for src changes
  let lastBuild = Date.now()
  fs.watch('src', { recursive: true }, () => {
    const now = Date.now()
    if (now - lastBuild < 200) return
    lastBuild = now
    build().catch(console.error)
  })
  console.log('[watch] watching src/**/*...')
} else {
  build().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
