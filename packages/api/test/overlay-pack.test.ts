import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { ApiError, FerroClient, studioEngineApi } from '../src'
import { DemoEngine, DEMO_TOKEN } from '../src/demo'

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

function setup() {
  const demo = new DemoEngine({ autoplay: false, latencyMs: 0 })
  const client = new FerroClient({ base: demo.base, token: DEMO_TOKEN, fetch: demo.fetch })
  return { demo, client }
}

function makeValidStreamlabsPack(): File {
  const cfg = {
    schemaVersion: 2,
    nodeType: 'RootNode',
    data: {
      scenes: {
        data: {
          items: [
            {
              name: 'Live',
              sceneId: 's1',
              slots: {
                data: {
                  items: [
                    {
                      id: '1',
                      name: 'BG',
                      sceneNodeType: 'item',
                      x: 0,
                      y: 0,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: { nodeType: 'ImageNode', data: { filename: 'assets/bg.png' } },
                    },
                    {
                      id: '2',
                      name: 'Header',
                      sceneNodeType: 'item',
                      x: 0.05,
                      y: 0.05,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: {
                        nodeType: 'TextNode',
                        data: { settings: { text: 'LIVE', font: { face: 'Orbitron', size: 48 } } },
                      },
                    },
                    {
                      id: '3',
                      name: 'Alerts',
                      sceneNodeType: 'item',
                      x: 0.25,
                      y: 0.1,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: { nodeType: 'WidgetNode', data: { type: 'AlertBox' } },
                    },
                    {
                      id: '4',
                      name: 'Legacy Widget',
                      sceneNodeType: 'item',
                      x: 0.7,
                      y: 0.7,
                      scaleX: 1 / 1920,
                      scaleY: 1 / 1080,
                      content: { nodeType: 'WidgetNode', data: { type: 'SponsorBanner' } },
                    },
                  ],
                },
              },
            },
          ],
        },
      },
    },
  }
  const bytes = zipSync({
    'config.json': strToU8(JSON.stringify(cfg)),
    'assets/bg.png': PNG_1X1,
  })
  return new File([bytes as Uint8Array<ArrayBuffer>], 'CyberPack.overlay', {
    type: 'application/zip',
  })
}

describe('.overlay theme pack preview, import, fonts, and undo in DemoEngine', () => {
  it('previews, imports, caches fonts, creates native overlays, and undoes cleanly', async () => {
    const { client } = setup()
    const eng = studioEngineApi(client)
    const initialOverlays = (await client.overlays()).length

    const pack = makeValidStreamlabsPack()
    const preview = await eng.previewOverlayPack(pack, pack.name)
    expect(preview.suggested_name).toBe('CyberPack')
    expect(preview.format).toBe('streamlabs')
    expect(preview.scene_count).toBe(1)
    expect(preview.media_files).toBe(1)
    expect(preview.widgets.some((w) => w.supported && w.mapped_to === 'alerts')).toBe(true)
    expect(preview.unknown_sources.some((u) => u.kind === 'SponsorBanner')).toBe(true)
    expect(preview.fonts).toEqual([{ family: 'Orbitron', style: 'Regular', status: 'missing' }])

    const report = await eng.importOverlayPack({
      preview_id: preview.preview_id,
      name: 'Cyber Night',
    })
    expect(report.name).toBe('Cyber Night')
    expect(report.previous_id).toBe('default')
    expect(report.overlays_created).toHaveLength(1)
    expect(report.fonts[0]?.status).toBe('downloaded')
    expect(report.offline_font_fallback).toBe(false)

    const shelf = await eng.shelf('collections')
    expect(shelf.current).toBe(report.id)
    expect((await client.overlays()).length).toBe(initialOverlays + 1)

    // Repeat preview shows font is cached locally
    const preview2 = await eng.previewOverlayPack(pack, 'CyberPack.overlay')
    expect(preview2.fonts[0]?.status).toBe('cached')

    // Undo restores previous collection and removes created overlay & collection
    const undone = await eng.undoOverlayPack(report.undo_token)
    expect(undone.restored_collection_id).toBe('default')
    expect(undone.removed_overlays).toBe(1)
    expect((await eng.shelf('collections')).current).toBe('default')
    expect((await client.overlays()).length).toBe(initialOverlays)
    await expect(eng.undoOverlayPack(report.undo_token)).rejects.toMatchObject({
      status: 404,
      code: 'no_undo',
    })
  })

  it('rejects zip-slip, disallowed files, and broken JSON while reporting offline fonts gracefully', async () => {
    const { demo, client } = setup()
    const eng = studioEngineApi(client)

    const slip = zipSync({ '../evil.png': PNG_1X1, 'config.json': strToU8('{}') })
    await expect(
      eng.previewOverlayPack(
        new File([slip as Uint8Array<ArrayBuffer>], 'slip.overlay'),
        'slip.overlay',
      ),
    ).rejects.toMatchObject({ status: 415, code: 'unsafe_overlay_file' })

    const scriptZip = zipSync({ 'config.json': strToU8('{}'), 'evil.js': strToU8('alert(1)') })
    await expect(
      eng.previewOverlayPack(
        new File([scriptZip as Uint8Array<ArrayBuffer>], 'js.overlay'),
        'js.overlay',
      ),
    ).rejects.toMatchObject({ status: 415, code: 'unsupported_type' })

    const brokenZip = zipSync({ 'config.json': strToU8('{not json') })
    await expect(
      eng.previewOverlayPack(
        new File([brokenZip as Uint8Array<ArrayBuffer>], 'broken.overlay'),
        'broken.overlay',
      ),
    ).rejects.toMatchObject({ status: 422, code: 'invalid_overlay' })

    // Offline font fallback leaves pack intact with a clear offline notice
    demo.studio.library.fontsOffline = true
    const preview = await eng.previewOverlayPack(makeValidStreamlabsPack(), 'Offline.overlay')
    const imported = await eng.importOverlayPack({ preview_id: preview.preview_id })
    expect(imported.offline_font_fallback).toBe(true)
    expect(imported.fonts[0]?.status).toBe('offline_fallback')
    expect(imported.fonts[0]?.message?.toLowerCase()).toContain('offline')

    // Active stream/recording blocks import/undo with 409 studio_busy
    demo.studio.library.busy = true
    await expect(eng.undoOverlayPack(imported.undo_token)).rejects.toMatchObject({
      status: 409,
      code: 'studio_busy',
    })
    demo.studio.library.busy = false
    await expect(eng.undoOverlayPack(imported.undo_token)).resolves.toMatchObject({
      removed_collection_id: imported.id,
    })
    expect(ApiError).toBeDefined()
  })
  it('refuses a zip bomb in the demo as the engine does, even with a forged size in the header', async () => {
    const { client } = setup()
    const eng = studioEngineApi(client)
    // 70 MB of zeros packs to a few dozen KB: past the 60 MB a single file may unpack to.
    const bomb = zipSync({
      'config.json': strToU8('{}'),
      'assets/loop.webm': new Uint8Array(70 * 1024 * 1024),
    })
    expect(bomb.length).toBeLessThan(200 * 1024)
    await expect(
      eng.previewOverlayPack(
        new File([bomb as Uint8Array<ArrayBuffer>], 'bomb.overlay'),
        'bomb.overlay',
      ),
    ).rejects.toMatchObject({ status: 413 })

    // The same, with the size in the central directory changed to 1 (what a hostile file does).
    const forged = new Uint8Array(bomb)
    const view = new DataView(forged.buffer)
    for (let at = 0; at + 46 <= forged.length; at++) {
      if (view.getUint32(at, true) === 0x02014b50) view.setUint32(at + 24, 1, true)
    }
    await expect(
      eng.previewOverlayPack(
        new File([forged as Uint8Array<ArrayBuffer>], 'forged.overlay'),
        'forged.overlay',
      ),
    ).rejects.toMatchObject({ status: 413 })
  })
  it('refuses the same odd paths in the demo as the engine does', async () => {
    const { client } = setup()
    const eng = studioEngineApi(client)
    const bad = [
      'assets/bg.png:evil',
      'assets/CON.png',
      'assets/nul',
      'assets/COM1.ttf',
      'assets/COM\u00b9.png',
      'assets/bg.png.',
      'assets/bg.png ',
      'assets/del\u007f.png',
      'assets/c1\u0085.png',
    ]
    for (const name of bad) {
      const zip = zipSync({ 'config.json': strToU8('{}'), [name]: PNG_1X1 })
      await expect(
        eng.previewOverlayPack(
          new File([zip as Uint8Array<ArrayBuffer>], 'x.overlay'),
          'x.overlay',
        ),
        name,
      ).rejects.toMatchObject({ status: 415, code: 'unsafe_overlay_file' })
    }
  })

  it('syncs imported .overlay collection, scenes, sources, busy lock, and undo when studioEngine is enabled', async () => {
    const demo = new DemoEngine({ autoplay: false, latencyMs: 0, studioEngine: { running: true } })
    const client = new FerroClient({ base: demo.base, token: DEMO_TOKEN, fetch: demo.fetch })
    const eng = studioEngineApi(client)

    const initialShelf = await eng.shelf('collections')
    expect(initialShelf.current).toBe('untitled')
    expect(initialShelf.list.map((c) => c.name)).toEqual(['Untitled'])
    expect((await eng.scenes()).scenes.map((s) => s.name)).toEqual([
      'Main',
      'Gameplay',
      'Chatting',
      'BRB',
    ])

    const preview = await eng.previewOverlayPack(makeValidStreamlabsPack(), 'NeonPack.overlay')
    const imported = await eng.importOverlayPack({ preview_id: preview.preview_id })
    expect(imported.previous_id).toBe('untitled')
    expect(imported.name).toBe('NeonPack')

    const afterImportShelf = await eng.shelf('collections')
    expect(afterImportShelf.current).toBe(imported.id)
    expect(afterImportShelf.list.some((c) => c.id === imported.id && c.name === 'NeonPack')).toBe(
      true,
    )

    const afterScenes = await eng.scenes()
    expect(afterScenes.scenes.map((s) => s.name)).toEqual(['Live'])
    expect(afterScenes.current).toBe('Live')

    const items = await eng.items('Live')
    expect(items.some((it) => it.kind === 'ferrocast_web')).toBe(true)

    demo.studioEngine!.setRecording(true)
    await expect(eng.undoOverlayPack(imported.undo_token)).rejects.toMatchObject({
      status: 409,
      code: 'studio_busy',
    })
    demo.studioEngine!.setRecording(false)

    const undone = await eng.undoOverlayPack(imported.undo_token)
    expect(undone.removed_collection_id).toBe(imported.id)
    expect(undone.restored_collection_id).toBe('untitled')

    const afterUndoShelf = await eng.shelf('collections')
    expect(afterUndoShelf.current).toBe('untitled')
    expect(afterUndoShelf.list.some((c) => c.id === imported.id)).toBe(false)
    expect((await eng.scenes()).scenes.map((s) => s.name)).toEqual([
      'Main',
      'Gameplay',
      'Chatting',
      'BRB',
    ])
  })
})
