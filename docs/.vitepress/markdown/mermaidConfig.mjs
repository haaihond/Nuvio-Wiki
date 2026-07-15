import { createHash } from 'node:crypto'

export const MERMAID_ASSET_VERSION = '1'

const commonThemeVariables = {
  fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  fontSize: '15px'
}

const themeVariables = {
  light: {
    background: '#f8fbff',
    primaryColor: '#e7f1ff',
    primaryTextColor: '#132238',
    primaryBorderColor: '#0877f9',
    secondaryColor: '#e4f8fc',
    secondaryTextColor: '#132238',
    secondaryBorderColor: '#0891b2',
    tertiaryColor: '#eef4fb',
    tertiaryTextColor: '#273b54',
    tertiaryBorderColor: '#91a5ba',
    lineColor: '#647b95',
    edgeLabelBackground: '#f8fbff',
    clusterBkg: '#f3f7fc',
    clusterBorder: '#c6d4e4',
    noteBkgColor: '#fff8d8',
    noteTextColor: '#4d3b00',
    noteBorderColor: '#d5a800',
    titleColor: '#132238'
  },
  dark: {
    background: '#121b27',
    primaryColor: '#17365c',
    primaryTextColor: '#edf5ff',
    primaryBorderColor: '#58a6ff',
    secondaryColor: '#153f4b',
    secondaryTextColor: '#edf5ff',
    secondaryBorderColor: '#61d7f3',
    tertiaryColor: '#1d2939',
    tertiaryTextColor: '#d9e8f8',
    tertiaryBorderColor: '#536a84',
    lineColor: '#8ca4be',
    edgeLabelBackground: '#121b27',
    clusterBkg: '#101a27',
    clusterBorder: '#30445e',
    noteBkgColor: '#24354b',
    noteTextColor: '#edf5ff',
    noteBorderColor: '#58a6ff',
    titleColor: '#edf5ff'
  }
}

const flowchart = {
  curve: 'basis',
  htmlLabels: true,
  nodeSpacing: 42,
  rankSpacing: 56,
  padding: 14,
  useMaxWidth: true
}

const renderFingerprint = JSON.stringify({
  version: MERMAID_ASSET_VERSION,
  commonThemeVariables,
  themeVariables,
  flowchart
})

export function normalizeMermaidSource(source) {
  return source.replace(/\r\n?/g, '\n')
}

export function mermaidAssetHash(source) {
  return createHash('sha256')
    .update(`${renderFingerprint}\0${normalizeMermaidSource(source)}`)
    .digest('hex')
    .slice(0, 16)
}

export function mermaidConfig(theme) {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      ...themeVariables[theme],
      ...commonThemeVariables
    },
    flowchart
  }
}
