import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Connect, Plugin, ViteDevServer } from 'vite'

// Dev-only disk persistence for lab scenes. The lab is never mounted in the
// Vercel production build (see main.tsx), so this endpoint only ever exists
// during `pnpm dev`. Scenes are plain JSON files under src/lab/scenes so they
// can be committed, diffed, and imported by the homepage to promote in code.

const ROUTE = '/__lab/scenes'
// Resolve against the Vite project root (cwd) so this holds whether the config
// is loaded directly or bundled.
const SCENES_DIR = path.resolve(process.cwd(), 'src/lab/scenes')
// Which scene is promoted to the live homepage (read by src/siteScene.ts).
const PROMOTED_FILE = path.resolve(process.cwd(), 'src/lab/promoted.json')

async function readBody(req: Connect.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

// Guard against path traversal — ids become filenames.
function sceneFile(id: string) {
  const safe = id.replace(/[^a-z0-9-]/gi, '')
  if (!safe) return null
  return path.join(SCENES_DIR, `${safe}.json`)
}

async function listScenes() {
  await fs.mkdir(SCENES_DIR, { recursive: true })
  const entries = await fs.readdir(SCENES_DIR)
  const scenes = await Promise.all(
    entries
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => JSON.parse(await fs.readFile(path.join(SCENES_DIR, name), 'utf8'))),
  )
  return scenes.sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

export function labScenes(): Plugin {
  return {
    name: 'lab-scenes',
    // Don't trigger HMR / full reloads when the lab writes scene files.
    handleHotUpdate(ctx) {
      if (ctx.file.startsWith(SCENES_DIR) || ctx.file === PROMOTED_FILE) return []
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use(ROUTE, async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const id = url.pathname.replace(/^\/+/, '')

          if (req.method === 'GET' && !id) {
            return sendJson(res, 200, await listScenes())
          }

          if (req.method === 'PUT') {
            const scene = JSON.parse(await readBody(req))
            const file = sceneFile(scene.id)
            if (!file) return sendJson(res, 400, { error: 'bad scene id' })
            await fs.mkdir(SCENES_DIR, { recursive: true })
            await fs.writeFile(file, `${JSON.stringify(scene, null, 2)}\n`, 'utf8')
            return sendJson(res, 200, { ok: true })
          }

          if (req.method === 'DELETE' && id) {
            const file = sceneFile(id)
            if (!file) return sendJson(res, 400, { error: 'bad scene id' })
            await fs.rm(file, { force: true })
            return sendJson(res, 200, { ok: true })
          }

          return sendJson(res, 405, { error: 'method not allowed' })
        } catch (error) {
          return sendJson(res, 500, { error: String(error) })
        }
      })

      // Promoted scene: which scene drives the live homepage.
      server.middlewares.use('/__lab/promoted', async (req, res) => {
        try {
          if (req.method === 'GET') {
            const raw = await fs.readFile(PROMOTED_FILE, 'utf8').catch(() => '{"id":null}')
            return sendJson(res, 200, JSON.parse(raw))
          }
          if (req.method === 'PUT') {
            const body = JSON.parse(await readBody(req))
            const id = typeof body.id === 'string' ? body.id.replace(/[^a-z0-9-]/gi, '') : null
            await fs.writeFile(PROMOTED_FILE, `${JSON.stringify({ id: id || null }, null, 2)}\n`, 'utf8')
            return sendJson(res, 200, { ok: true, id: id || null })
          }
          return sendJson(res, 405, { error: 'method not allowed' })
        } catch (error) {
          return sendJson(res, 500, { error: String(error) })
        }
      })
    },
  }
}
