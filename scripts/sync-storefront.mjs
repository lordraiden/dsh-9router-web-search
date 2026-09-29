#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

const storefrontOwner = process.env.STOREFRONT_OWNER ?? 'awesome-dsh-plugin'
const storefrontRepo = process.env.STOREFRONT_REPO ?? 'awesome-dsh-plugin'
const pluginOwner = process.env.PLUGIN_OWNER ?? 'lordraiden'
const pluginRepo = process.env.PLUGIN_REPO ?? 'dsh-9router-web-search'
const pluginPackage = process.env.PLUGIN_PACKAGE ?? 'dsh-9router-web-search'
const pluginUrl = `https://github.com/${pluginOwner}/${pluginRepo}`
const branch = `sync/${pluginOwner}__${pluginRepo}`
const forkOwner = process.env.STOREFRONT_FORK_OWNER ?? pluginOwner
const root = resolve(import.meta.dirname, '..')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const dryRun = process.env.DRY_RUN === '1'

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', ...options }).trim()
}

function ghApi(path) {
  return JSON.parse(run('gh', ['api', path]))
}

function assertStorefrontPushAccess() {
  const fork = ghApi(`repos/${forkOwner}/${storefrontRepo}`)
  if (fork.permissions?.push !== true) {
    throw new Error(`GitHub credentials cannot push to ${forkOwner}/${storefrontRepo}`)
  }
}

function yamlQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function checkRequirements() {
  const repoInfo = ghApi(`repos/${pluginOwner}/${pluginRepo}`)
  const commits = ghApi(`repos/${pluginOwner}/${pluginRepo}/commits?per_page=100`).length
  const topics = ghApi(`repos/${pluginOwner}/${pluginRepo}/topics`).names ?? []
  const failures = []
  const ageDays = (Date.now() - Date.parse(repoInfo.created_at)) / 86_400_000

  if (ageDays < 1) failures.push(`repository age is ${ageDays.toFixed(2)} days; at least 1 day is required`)
  if (commits < 10) failures.push(`repository has ${commits} commits; at least 10 are required`)
  if (!topics.includes('dsh-plugin')) failures.push('repository is missing the dsh-plugin topic')
  if (!packageJson.dsh?.bundle) failures.push('package.json is missing dsh.bundle')
  if (repoInfo.archived) failures.push('repository is archived')
  if (failures.length) throw new Error(`storefront requirements not met:\n- ${failures.join('\n- ')}`)
}

function buildEntry() {
  return [
    `url: ${pluginUrl}`,
    `name: ${pluginOwner}/${pluginRepo}`,
    'category: tools',
    'description:',
    `  en: ${yamlQuote(packageJson.description)}`,
    `  zh: ${yamlQuote('9router 网页搜索与网页抓取 provider，为 DeepSeek Harness 提供搜索和抓取能力。')}`,
    '',
  ].join('\n')
}

function hasExistingEntry() {
  try {
    run('gh', ['api', `repos/${storefrontOwner}/${storefrontRepo}/contents/data/plugins/${pluginOwner}__${pluginRepo}.yml?ref=main`])
    return true
  } catch {
    return false
  }
}

function hasOpenSyncPullRequest() {
  const query = encodeURIComponent(`repo:${storefrontOwner}/${storefrontRepo} is:pr is:open head:${forkOwner}:${branch}`)
  return JSON.parse(run('gh', ['api', `search/issues?q=${query}`])).total_count > 0
}

function updateStorefront() {
  assertStorefrontPushAccess()
  const worktree = resolve(root, '.storefront-sync')
  try {
    run('git', ['clone', `https://github.com/${storefrontOwner}/${storefrontRepo}.git`, worktree])
    const forkUrl = `https://github.com/${forkOwner}/${storefrontRepo}.git`
    run('git', ['-C', worktree, 'remote', 'add', 'fork', forkUrl])
    const entryFile = `data/plugins/${pluginOwner}__${pluginRepo}.yml`
    const entryPath = resolve(worktree, entryFile)
    const exists = hasExistingEntry()

    run('git', ['-C', worktree, 'switch', '-c', branch])
    writeFileSync(entryPath, buildEntry())
    run('npm', ['ci'], { cwd: worktree })
    run('node', ['scripts/generate-readme.mjs'], { cwd: worktree })
    run('git', ['-C', worktree, 'config', 'user.name', 'github-actions[bot]'])
    run('git', ['-C', worktree, 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
    run('git', ['-C', worktree, 'add', entryFile, 'README.md', 'README.zh.md'])

    try {
      run('git', ['-C', worktree, 'diff', '--cached', '--quiet'])
      console.log('skip: storefront entry is already current')
      return
    } catch {}

    const action = exists ? 'update' : 'add'
    run('git', ['-C', worktree, 'commit', '-m', `${action}: ${pluginOwner}/${pluginRepo}`])
    run('git', ['-C', worktree, 'push', '--set-upstream', 'fork', `HEAD:${branch}`])

    if (!hasOpenSyncPullRequest()) {
      run('gh', ['pr', 'create', '-R', `${storefrontOwner}/${storefrontRepo}`, '--base', 'main', '--head', `${forkOwner}:${branch}`, '--title', `${action === 'add' ? 'Add' : 'Update'} ${pluginPackage} plugin`, '--body', `Automated storefront ${action} for ${pluginPackage}@${packageJson.version}.`])
    }
  } finally {
    // The temporary clone is always removed, on success and on failure.
    rmSync(worktree, { recursive: true, force: true })
  }
}

checkRequirements()
if (hasOpenSyncPullRequest()) {
  console.log(`skip: an open storefront sync PR already exists for ${pluginUrl}`)
  process.exit(0)
}
if (dryRun) {
  console.log(`would sync ${pluginPackage}@${packageJson.version} from GitHub to ${branch}`)
  process.exit(0)
}
updateStorefront()
