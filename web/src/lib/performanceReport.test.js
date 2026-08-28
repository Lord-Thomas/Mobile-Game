import { describe, expect, it } from 'vitest'
import {
  createPerformanceReport,
  getPerformanceReportFilename,
  serializePerformanceReport,
} from './performanceReport'

describe('performanceReport', () => {
  it('combines render, runtime and diagnostic measurements into a stable report', () => {
    const report = createPerformanceReport({
      label: 'Extérieur complet',
      generatedAt: '2026-08-27T10:00:00.000Z',
      environment: { hardwareConcurrency: 8 },
      stats: {
        stableWindowSeconds: 15,
        measurementEpoch: 3,
        measurementStartedAt: 1000,
        measurementEndedAt: 16000,
        stableFps: 58.5,
        onePercentLowFps: 42,
        stableMedianFrameTimeMs: 16.4,
        stableP95FrameTimeMs: 20,
        stableP99FrameTimeMs: 23.8,
        stableMaxFrameTimeMs: 48,
        fpsVariationPercent: 4.2,
        drawCalls: 210,
        triangles: 320000,
        textures: 84,
        geometries: 61,
        programs: 18,
        dpr: 1.5,
        drawingBufferWidth: 1920,
        drawingBufferHeight: 1080,
        drawCallsByCategory: { grass: 4 },
        trianglesByCategory: { grass: 180000 },
        gpu: { supported: true, averageMs: 7.2, p95Ms: 11.8, samples: 850 },
        resources: {
          start: { textures: 80, geometries: 60, programs: 17 },
          peak: { textures: 85, geometries: 63, programs: 19 },
          end: { textures: 84, geometries: 61, programs: 18 },
          delta: { textures: 4, geometries: 1, programs: 1 },
          samples: 61,
        },
      },
      scheduler: { enabled: true, frame: { averageMs: 1.2 } },
      diagnostics: {
        mode: { enabled: true },
        window: { since: 1000, until: 16000 },
        droppedEventCount: 12,
        droppedFreezeCount: 1,
        truncatedBeforeWindow: false,
        events: [
          { type: 'frame', t: 900, durationMs: 24 },
          { type: 'frame', t: 1000, durationMs: 26, context: { zone: 'outdoor' } },
          { type: 'frame', t: 1100, durationMs: 45, context: { phase: 'runtime' } },
          { type: 'frame', t: 1200, durationMs: 70, renderer: { calls: 210 } },
          { type: 'react:commit', t: 1199, data: { id: 'OutdoorNeighborhood', phase: 'update', durationMs: 5 } },
          { type: 'browser:long-task', t: 1210, data: { durationMs: 55, source: 'window' } },
          { type: 'span', name: 'nearby-work', t: 1190, durationMs: 8 },
        ],
        freezes: [{ freeze: { severity: 'freeze', durationMs: 120 } }],
      },
    })

    expect(report.frame.p99Ms).toBe(23.8)
    expect(report.version).toBe(5)
    expect(report.measurement).toEqual({
      epoch: 3,
      startedAtMs: 1000,
      endedAtMs: 16000,
      durationMs: 15000,
    })
    expect(report.render.programs).toBe(18)
    expect(report.gpu).toMatchObject({ supported: true, p95Ms: 11.8 })
    expect(report.resources.delta).toEqual({ textures: 4, geometries: 1, programs: 1 })
    expect(report.runtime.frame.averageMs).toBe(1.2)
    expect(report.diagnostics.freezeCount).toBe(1)
    expect(report.diagnostics.window).toEqual({ since: 1000, until: 16000 })
    expect(report.diagnostics.droppedEventCount).toBe(12)
    expect(report.diagnostics.hitches.counts).toEqual({
      atLeast25Ms: 3,
      atLeast40Ms: 2,
      atLeast60Ms: 1,
    })
    expect(report.diagnostics.hitches.worstMs).toBe(70)
    expect(report.diagnostics.hitches.reactCorrelations).toEqual({
      windowMs: 16.7,
      hitchesWithReactCommit: 1,
      hitchesWithoutReactCommit: 2,
      bySubtree: [{
        id: 'OutdoorNeighborhood',
        hitchCount: 1,
        worstHitchMs: 70,
        averageRenderMs: 5,
        maxRenderMs: 5,
      }],
    })
    expect(report.diagnostics.hitches.top[0]).toMatchObject({
      timeMs: 1200,
      durationMs: 70,
      severity: 'severe-stutter',
      renderer: { calls: 210 },
      reactCommits: [{
        type: 'react:commit',
        id: 'OutdoorNeighborhood',
        offsetMs: -1,
        durationMs: 5,
        phase: 'update',
      }],
    })
    expect(report.diagnostics.hitches.top[0].nearbySignals[0]).toMatchObject({
      type: 'browser:long-task',
      durationMs: 55,
      source: 'window',
    })
    expect(report.diagnostics.hitches.top[0].nearbySignals).toContainEqual(expect.objectContaining({
      type: 'react:commit',
      id: 'OutdoorNeighborhood',
    }))
    expect(serializePerformanceReport(report)).toContain('Extérieur complet')
  })

  it('creates a filesystem-safe, descriptive filename', () => {
    expect(getPerformanceReportFilename({
      label: 'Extérieur / tout actif',
      generatedAt: '2026-08-27T10:00:00.000Z',
    })).toBe('performance-exterieur-tout-actif-2026-08-27T10-00-00-000Z.json')
  })
})
