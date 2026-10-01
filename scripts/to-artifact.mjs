// Turns the single-file build into a page fragment (title + styles + script)
// suitable for publishing as a claude.ai Artifact preview.
import { readFileSync, writeFileSync } from 'node:fs'
const html = readFileSync('dist-preview/index.html', 'utf8')
const title = html.match(/<title>[\s\S]*?<\/title>/)[0]
const links = html.match(/<link[^>]+fonts\.googleapis[^>]*>/g) ?? []
const styles = html.match(/<style[\s\S]*?<\/style>/g) ?? []
const scripts = html.match(/<script[\s\S]*?<\/script>/g) ?? []
const out = [title, ...links, ...styles, '<div id="root"></div>', ...scripts].join('\n')
writeFileSync('dist-preview/app-casa.html', out)
console.log('dist-preview/app-casa.html', (out.length / 1024).toFixed(0) + ' KB')
