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
      },
      scheduler: { enabled: true, frame: { averageMs: 1.2 } },
      diagnostics: {
        mode: { enabled: true },
        window: { since: 1000, until: 16000 },
        droppedEventCount: 12,
        droppedFreezeCount: 1,
        truncatedBeforeWindow: false,
        events: [{ type: 'frame' }],
        freezes: [{ freeze: { severity: 'freeze', durationMs: 120 } }],
      },
    })

    expect(report.frame.p99Ms).toBe(23.8)
    expect(report.measurement).toEqual({
      epoch: 3,
      startedAtMs: 1000,
      endedAtMs: 16000,
      durationMs: 15000,
    })
    expect(report.render.programs).toBe(18)
    expect(report.runtime.frame.averageMs).toBe(1.2)
    expect(report.diagnostics.freezeCount).toBe(1)
    expect(report.diagnostics.window).toEqual({ since: 1000, until: 16000 })
    expect(report.diagnostics.droppedEventCount).toBe(12)
    expect(serializePerformanceReport(report)).toContain('Extérieur complet')
  })

  it('creates a filesystem-safe, descriptive filename', () => {
    expect(getPerformanceReportFilename({
      label: 'Extérieur / tout actif',
      generatedAt: '2026-08-27T10:00:00.000Z',
    })).toBe('performance-exterieur-tout-actif-2026-08-27T10-00-00-000Z.json')
  })
})
