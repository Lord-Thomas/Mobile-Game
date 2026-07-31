import { useRef } from 'react'
import { MathUtils, Vector3 } from 'three'
import { FRAME_PHASES } from '../game/runtime/frameScheduler'
import { useGameFrameTask } from '../game/runtime/useGameFrameTask'

const SLIME_SQUASH = { idle: 0.04, move: 0.12, hit: 0.34 }
const SLIME_ATTACK_JUMP = 0.35
const SLIME_ATTACK_LUNGE = 0.30
const ENEMY_PROCEDURAL_ANIMATION_CULL_DISTANCE_SQ = 55 * 55
const ENEMY_PROCEDURAL_ANIMATION_VIEW_MARGIN = 1.35

function slimeAttackPose(progress) {
  const jumpArc = Math.sin(Math.PI * Math.min(1, progress / 0.9))
  const jumpY = jumpArc * jumpArc * SLIME_ATTACK_JUMP
  const lungeZ = Math.sin(Math.PI * Math.min(1, progress)) * SLIME_ATTACK_LUNGE
  let squash
  if (progress < 0.16) squash = (progress / 0.16) * 0.28
  else if (progress < 0.5) squash = MathUtils.lerp(0.28, -0.18, (progress - 0.16) / 0.34)
  else if (progress < 0.85) squash = MathUtils.lerp(-0.18, 0, (progress - 0.5) / 0.35)
  else squash = Math.sin(((progress - 0.85) / 0.15) * Math.PI) * 0.34
  return { jumpY, lungeZ, squash }
}

/**
 * Animation procédurale commune à tous les slimes, y compris ceux du Roi Slime.
 * L'origine du modèle doit être placée aux pieds via `offset`.
 */
export default function SlimeProceduralModel({
  object,
  offset,
  scale,
  renderOrder = 0,
  positionRef,
  hitSquashRef,
  attackRef,
}) {
  const offsetGroupRef = useRef()
  const innerRef = useRef()
  const squashRef = useRef(0)
  const movingRef = useRef(0)
  const lastPosRef = useRef(null)
  const attackAnimRef = useRef(null)
  const seenAttackRef = useRef(0)
  const projectedPositionRef = useRef(new Vector3())

  useGameFrameTask((state, delta) => {
    const inner = innerRef.current
    const offsetGroup = offsetGroupRef.current
    if (!inner || !offsetGroup) return
    const pos = positionRef?.current
    const camera = state.camera
    if (pos && camera?.position) {
      const dx = pos.x - camera.position.x
      const dy = pos.y - camera.position.y
      const dz = pos.z - camera.position.z
      if (dx * dx + dy * dy + dz * dz > ENEMY_PROCEDURAL_ANIMATION_CULL_DISTANCE_SQ) {
        const projected = projectedPositionRef.current
        projected.set(pos.x, pos.y + 1, pos.z).project(camera)
        if (
          projected.z < -1
          || projected.z > 1
          || Math.abs(projected.x) > ENEMY_PROCEDURAL_ANIMATION_VIEW_MARGIN
          || Math.abs(projected.y) > ENEMY_PROCEDURAL_ANIMATION_VIEW_MARGIN
        ) {
          return
        }
      }
    }

    const elapsed = state.clock.elapsedTime
    const dt = Math.min(Math.max(delta, 1 / 240), 1 / 20)
    let speed = 0
    if (pos) {
      const last = lastPosRef.current
      if (last) {
        speed = Math.hypot(pos.x - last.x, pos.z - last.z) / dt
        last.x = pos.x
        last.z = pos.z
      } else {
        lastPosRef.current = { x: pos.x, z: pos.z }
      }
    }
    movingRef.current = MathUtils.lerp(
      movingRef.current,
      speed > 0.3 ? 1 : 0,
      1 - Math.exp(-10 * dt),
    )

    const attack = attackRef?.current
    if (attack && attack.endsAt !== seenAttackRef.current) {
      seenAttackRef.current = attack.endsAt
      attackAnimRef.current = {
        start: elapsed,
        duration: Math.max(0.25, attack.endsAt - elapsed),
      }
    }

    let jumpY = 0
    let lungeZ = 0
    let attackSquash = 0
    let attacking = false
    const animation = attackAnimRef.current
    if (animation) {
      const progress = (elapsed - animation.start) / animation.duration
      if (progress >= 1) {
        attackAnimRef.current = null
      } else {
        attacking = true
        const pose = slimeAttackPose(progress)
        jumpY = pose.jumpY
        lungeZ = pose.lungeZ
        attackSquash = pose.squash
      }
    }
    offsetGroup.position.set(0, jumpY, lungeZ)

    const ambient = Math.sin(elapsed * 3) * SLIME_SQUASH.idle
      + movingRef.current * Math.abs(Math.sin(elapsed * 9)) * SLIME_SQUASH.move
      + (hitSquashRef?.current ?? 0) * SLIME_SQUASH.hit
    const target = attacking ? attackSquash + ambient * 0.3 : ambient
    squashRef.current = MathUtils.lerp(
      squashRef.current,
      target,
      1 - Math.exp(-(attacking ? 22 : 14) * dt),
    )
    const squash = squashRef.current
    inner.scale.set(1 + squash * 0.7, 1 - squash, 1 + squash * 0.7)
    inner.rotation.z = Math.sin(elapsed * 5) * 0.03 * (0.35 + movingRef.current)

    if (hitSquashRef && hitSquashRef.current > 0) {
      hitSquashRef.current = Math.max(0, hitSquashRef.current - dt * 3.5)
    }
  }, {
    label: 'enemy-procedural-animation',
    phase: FRAME_PHASES.POST_SIMULATION,
  })

  return (
    <group ref={offsetGroupRef}>
      <group scale={scale} renderOrder={renderOrder}>
        <group ref={innerRef}>
          <primitive object={object} position={offset} />
        </group>
      </group>
    </group>
  )
}
