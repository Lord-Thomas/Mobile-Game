import { useEffect, useRef } from 'react'
import {
  BOSS_SLIME_PRESET_ID,
  BOSS_SLIME_RED_VALUES,
  getEffectiveArtDirectionValues,
  getSelectedArtDirectionValues,
  useArtDirectionStore,
} from '../../artDirection/artDirectionStore'
import {
  createBossSlimeRuntimeTarget,
  interpolateArtDirectionValues,
} from '../../artDirection/artDirectionTransition'
import { useBossStore } from './bossStore'

const TRANSITION_DURATION_MS = 1800
const UPDATE_INTERVAL_MS = 32

export default function BossArtDirectionBridge() {
  const combatAtmosphereActive = useBossStore((state) => state.active && state.state !== 'dying')
  const previousActiveRef = useRef(false)
  const normalValuesRef = useRef(null)
  const animationFrameRef = useRef(0)

  useEffect(() => {
    if (combatAtmosphereActive === previousActiveRef.current) return undefined
    previousActiveRef.current = combatAtmosphereActive
    window.cancelAnimationFrame(animationFrameRef.current)

    const artState = useArtDirectionStore.getState()
    const fromValues = getEffectiveArtDirectionValues(artState)
    let targetValues

    if (combatAtmosphereActive) {
      normalValuesRef.current = getSelectedArtDirectionValues(artState)
      const bossPreset = artState.presets.find((preset) => preset.id === BOSS_SLIME_PRESET_ID)
      targetValues = createBossSlimeRuntimeTarget(
        normalValuesRef.current,
        bossPreset?.values ?? BOSS_SLIME_RED_VALUES,
      )
    } else {
      targetValues = normalValuesRef.current ?? getSelectedArtDirectionValues(artState)
    }

    const startedAt = performance.now()
    let lastUpdateAt = -Infinity
    const update = (timestamp) => {
      const progress = Math.min(1, (timestamp - startedAt) / TRANSITION_DURATION_MS)
      if (timestamp - lastUpdateAt >= UPDATE_INTERVAL_MS || progress >= 1) {
        useArtDirectionStore.getState().setRuntimeValues(
          interpolateArtDirectionValues(fromValues, targetValues, progress),
        )
        lastUpdateAt = timestamp
      }
      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(update)
      } else if (!combatAtmosphereActive) {
        useArtDirectionStore.getState().setRuntimeValues(null)
        normalValuesRef.current = null
      }
    }

    animationFrameRef.current = window.requestAnimationFrame(update)
    return () => window.cancelAnimationFrame(animationFrameRef.current)
  }, [combatAtmosphereActive])

  useEffect(() => () => {
    window.cancelAnimationFrame(animationFrameRef.current)
    useArtDirectionStore.getState().setRuntimeValues(null)
  }, [])

  return null
}
