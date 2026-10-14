#!/usr/bin/env node
/**
 * Publish the deployable artefacts for a pull request.
 *
 * Uploads them to bin.4gl.io and posts (or updates) a single PR comment with
 * the links, the checksums and the recipe.
 *
 * Nothing here needs a secret: bin.4gl.io takes an unauthenticated POST, and
 * the PR comment uses the workflow's own GITHUB_TOKEN. The deploy itself is
 * deliberately left to a human, with their own credentials - the CI job never
 * holds a credential for any SAS platform.
 *
 * Usage: publish-deployables.mjs <artefactDir> <prNumber> <headSha> <appLoc>
 */
import { readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

const [artefactDir, prNumber, headSha, appLoc] = process.argv.slice(2)
if (!artefactDir || !prNumber || !headSha) {
  console.error('usage: publish-deployables.mjs <artefactDir> <prNumber> <headSha> <appLoc>')
  process.exit(1)
}

const BIN = 'https://bin.4gl.io'
const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/')
const token = process.env.GITHUB_TOKEN
if (!owner || !repo || !token) {
  console.error('GITHUB_REPOSITORY and GITHUB_TOKEN are required')
  process.exit(1)
}

/**
 * Upload one file to bin.4gl.io.
 *
 * Text goes in the `content` field and is read back from /raw/<id>; anything
 * binary goes in `file` and is read back from /file/<id> (content= mangles
 * bytes). The endpoint answers 302 to the management page, which needs auth -
 * so do not follow it, just read the Location header.
 */
async function upload(path, expiry = '1week') {
  const bytes = readFileSync(path)
  const isText = /\.(json|sas|md|txt)$/i.test(path)
  const form = new FormData()
  if (isText) {
    // `content` must be a FILE part, not a plain field: as a plain field
    // MicroBin normalises the text and the artefact comes back corrupted (the
    // Viya programme grew by 10 KB and would not run). Sent as a part it is
    // byte-exact, and /raw/<id> serves it faithfully.
    form.append('content', new Blob([bytes], { type: 'text/plain' }), basename(path))
  } else {
    form.append('file', new Blob([bytes]), basename(path))
  }
  form.append('expiry', expiry)

  const res = await fetch(`${BIN}/upload`, { method: 'POST', body: form, redirect: 'manual' })
  const location = res.headers.get('location')
  if (!location) throw new Error(`no Location header for ${path} (HTTP ${res.status})`)
  const id = location.split('/').filter(Boolean).pop()
  const url = isText ? `${BIN}/raw/${id}` : `${BIN}/file/${id}`
  return { path, id, url, bytes: bytes.length, kind: isText ? 'text' : 'binary' }
}

const files = ['adapter-tests-deployable.zip', 'adaptertestssasjs.json', 'adaptertestsviya.sas']
const uploaded = []
for (const f of files) {
  const p = join(artefactDir, f)
  try {
    statSync(p)
  } catch {
    console.error(`skipping missing ${f}`)
    continue
  }
  const r = await upload(p)
  console.log(`uploaded ${basename(p)} -> ${r.url} (${r.bytes} bytes, ${r.kind})`)
  uploaded.push(r)
}

if (!uploaded.length) {
  console.error('nothing uploaded')
  process.exit(1)
}

const sha256 = (await import('node:crypto')).createHash('sha256')
const checksums = files
  .map((f) => {
    try {
      const h = sha256.copy().update(readFileSync(join(artefactDir, f))).digest('hex')
      return `    ${h}  ${f}`
    } catch {
      return null
    }
  })
  .filter(Boolean)

const linkFor = (name) => uploaded.find((u) => basename(u.path) === name)
const zip = linkFor('adapter-tests-deployable.zip')
const pack = linkFor('adaptertestssasjs.json')
const viya = linkFor('adaptertestsviya.sas')

const marker = '<!-- adapter-tests-deployables -->'
const body = `${marker}
## Adapter-tests deployables for this PR

Built from **${headSha.slice(0, 10)}**. The adapter from this commit is baked into the frontend bundle, so deploying this tests *this* PR's adapter.

**App location:** \`${appLoc}\` - per-run on purpose, so two PRs cannot collide and a redeploy never hits the "already exists" conflict.

| Artefact | Link | Use |
|---|---|---|
| Deployable package | ${zip ? zip.url : '(missing)'} | unzip, then \`npx @sasjs/cli deploy -t <target>\` |
| SASjs Server service pack | ${pack ? pack.url : '(missing)'} | \`sasjs servicepack deploy\` against SASjs Server |
| Viya deploy programme | ${viya ? viya.url : '(missing)'} | \`sasjs run\` against Viya, or paste into SAS Studio |

Links are on bin.4gl.io and expire in a week.

    sha256:
${checksums.join('\n')}

### To run it

1. Download the deployable package and unzip it.
2. Deploy with **your own** credentials - the CLI prompts, or use \`.env.4gl\` / \`.env.viya\`:

       npx @sasjs/cli deploy -t 4gl     # SASjs Server
       npx @sasjs/cli deploy -t viya    # Viya

3. Open the streamed app and let its suite run. Every check is about how the adapter parses a SAS response - \`sendObj\`, \`sendArr\`, \`runAsTask\`.
4. Report the result here.

CI holds no credential for either platform by design: it builds, you deploy.
`

// One comment per PR, updated in place rather than accumulating.
//
// Every response is checked. Without this a 401 (no pull-requests scope), a 403
// secondary rate limit or a 404 yields an error body with no `id`, the script
// logs "created comment undefined" and still exits 0 - so the job is green
// while the comment it exists to post never lands, and the coverage quietly
// disappears.
const api = async (path, init = {}) => {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sasjs-adapter-pr-deployables',
      ...(init.headers ?? {})
    }
  })
  if (!res.ok) {
    throw new Error(
      `GitHub API ${init.method ?? 'GET'} ${path} failed: ${res.status} ${res.statusText}\n` +
        `${await res.text()}`
    )
  }
  return res
}

const existing = await (
  await api(`/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`)
).json()
const mine = existing.find((c) => (c.body ?? '').includes(marker))

if (mine) {
  await api(`/repos/${owner}/${repo}/issues/comments/${mine.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body })
  })
  console.log(`updated comment ${mine.id}`)
} else {
  const created = await (
    await api(`/repos/${owner}/${repo}/issues/${prNumber}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body })
    })
  ).json()
  if (!created?.id) {
    throw new Error(`comment was not created: ${JSON.stringify(created)}`)
  }
  console.log(`created comment ${created.id} -> ${created.html_url}`)
}
