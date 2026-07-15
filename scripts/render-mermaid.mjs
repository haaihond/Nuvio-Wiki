import { readdir, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderMermaid } from '@mermaid-js/mermaid-cli'
import puppeteer from 'puppeteer'
import {
  mermaidAssetHash,
  mermaidConfig,
  normalizeMermaidSource
} from '../docs/.vitepress/markdown/mermaidConfig.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const docsDir = path.join(rootDir, 'docs')
const publicDir = path.join(docsDir, 'public')
const outputDir = path.join(publicDir, 'mermaid')
const mermaidFence = /^[ \t]*```mermaid(?:[^\S\r\n].*)?\r?\n([\s\S]*?)^[ \t]*```[ \t]*$/gm

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.name === 'public' || entry.name === '.vitepress') continue

    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await markdownFiles(entryPath))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath)
    }
  }

  return files
}

async function collectDiagrams() {
  const diagrams = new Map()

  for (const file of await markdownFiles(docsDir)) {
    const markdown = await readFile(file, 'utf8')
    for (const match of markdown.matchAll(mermaidFence)) {
      const source = normalizeMermaidSource(match[1])
      diagrams.set(mermaidAssetHash(source), source)
    }
  }

  return diagrams
}

async function renderDiagram(browser, hash, source, theme) {
  const { data } = await renderMermaid(browser, source, 'svg', {
    backgroundColor: 'transparent',
    mermaidConfig: mermaidConfig(theme),
    svgId: `mermaid-${hash}-${theme}`,
    viewport: { width: 1200, height: 800, deviceScaleFactor: 1 }
  })

  await writeFile(path.join(outputDir, `${hash}-${theme}.svg`), data)
}

const diagrams = await collectDiagrams()

if (path.dirname(outputDir) !== publicDir || path.basename(outputDir) !== 'mermaid') {
  throw new Error(`Refusing to replace unexpected Mermaid output directory: ${outputDir}`)
}

await rm(outputDir, { recursive: true, force: true })
await mkdir(outputDir, { recursive: true })

if (diagrams.size === 0) {
  console.log('No Mermaid diagrams found.')
  process.exit(0)
}

const browser = await puppeteer.launch({ headless: 'shell' })

try {
  await Promise.all(
    [...diagrams].flatMap(([hash, source]) =>
      ['light', 'dark'].map((theme) => renderDiagram(browser, hash, source, theme))
    )
  )
} finally {
  await browser.close()
}

console.log(`Pre-rendered ${diagrams.size} Mermaid diagram${diagrams.size === 1 ? '' : 's'} for light and dark themes.`)
