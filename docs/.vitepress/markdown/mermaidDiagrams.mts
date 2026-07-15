import { existsSync } from 'node:fs'
import path from 'node:path'
import type MarkdownIt from 'markdown-it'
import { mermaidAssetHash, normalizeMermaidSource } from './mermaidConfig.mjs'

interface MermaidDiagramOptions {
  base?: string
}

function assetUrl(base: string, fileName: string) {
  return `${base.replace(/\/?$/, '/')}mermaid/${fileName}`
}

export function mermaidDiagrams(md: MarkdownIt, { base = '/' }: MermaidDiagramOptions = {}) {
  const defaultFence = md.renderer.rules.fence

  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index]
    const language = token.info.trim().split(/\s+/, 1)[0].toLowerCase()

    if (language !== 'mermaid') {
      return defaultFence
        ? defaultFence(tokens, index, options, env, self)
        : self.renderToken(tokens, index, options)
    }

    const hash = mermaidAssetHash(normalizeMermaidSource(token.content))
    const lightFile = `${hash}-light.svg`
    const darkFile = `${hash}-dark.svg`
    const generatedDir = path.resolve(process.cwd(), 'docs/public/mermaid')

    for (const fileName of [lightFile, darkFile]) {
      if (!existsSync(path.join(generatedDir, fileName))) {
        throw new Error(`Missing pre-rendered Mermaid asset ${fileName}. Run npm run docs:mermaid first.`)
      }
    }

    return [
      '<figure class="mermaid-diagram" role="img" aria-label="Diagram">',
      `<img class="mermaid-diagram__output mermaid-diagram__output--light" src="${assetUrl(base, lightFile)}" alt="" loading="lazy" decoding="async">`,
      `<img class="mermaid-diagram__output mermaid-diagram__output--dark" src="${assetUrl(base, darkFile)}" alt="" loading="lazy" decoding="async">`,
      '</figure>'
    ].join('')
  }
}
