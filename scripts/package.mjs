import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('theme.json', 'utf8'))
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
if (manifest.version !== pkg.version) throw new Error('package.json 与 theme.json 版本必须一致')
if (!/^[A-Za-z0-9_-]+$/.test(manifest.short)) throw new Error('主题 short 格式不正确')
if (!existsSync('dist/index.html')) throw new Error('请先构建主题')
const files = ['theme.json', 'dist', 'LICENSE', 'THIRD_PARTY_LICENSES.md', ...(existsSync('preview.png') ? ['preview.png'] : [])]
// The hub installer expects theme.json and dist/ at the archive root.
// It creates the directory named by `short` itself (Monitor frontend.rs::publish).
execFileSync('tar', ['-czf', 'theme.tar.gz', ...files], { stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' } })
const hash = createHash('sha256').update(readFileSync('theme.tar.gz')).digest('hex')
writeFileSync('theme.tar.gz.sha256', `${hash}  theme.tar.gz\n`)
execFileSync('python3', ['scripts/verify-package.py'], { stdio: 'inherit' })
console.log(`已生成 theme.tar.gz · ${(readFileSync('theme.tar.gz').length / 1024 / 1024).toFixed(2)} MB`)
