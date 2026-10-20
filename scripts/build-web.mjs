import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const version = process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME?.startsWith('v')
  ? process.env.GITHUB_REF_NAME.slice(1) : pkg.version
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
writeFileSync('dist/BUILD.json', JSON.stringify({ version, build_id: `workbench-${version}-${commit}`, source_commit: commit }, null, 2) + '\n')
