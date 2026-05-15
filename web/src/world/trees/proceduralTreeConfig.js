import { Tree } from '@dgreenheck/ez-tree'
import { BufferAttribute, Box3, Color, Float32BufferAttribute, FrontSide, MeshBasicMaterial, Vector3 } from 'three'

// Shared uniform objects — all animated leaf shaders reference these same objects.
// Updating .value once per frame updates every tree variant simultaneously.
export const treeLeafWindUniforms = {
  uTime: { value: 0 },
  uWindDirection: { value: new Vector3(0.86, 0, 0.5).normalize() },
  uWindStrength: { value: 1.1 },
  uWindSpeed: { value: 0.55 },
  uWindScale: { value: 0.038 },
  uTreeHeight: { value: 52.0 },
}

const leafBottomColor = new Color('#638b0f')
const leafMiddleColor = new Color('#6f970e')
const leafTopColor = new Color('#8aac22')
const leafCoolShade = new Color('#557f25')
const leafWarmHighlight = new Color('#a6bf36')

function getPresetOptions(preset) {
  const tree = new Tree()
  tree.loadPreset(typeof preset === 'string' ? preset : DEFAULT_TREE_CONFIG.preset)
  return tree.options
}

export const DEFAULT_TREE_CONFIG = {
  preset: 'Ash Medium',
  seed: 42,
  position: { x: 0, y: 0, z: 0 },
  rotationY: 0,
  scale: 0.12,
  snapToGround: true,
  bark: { tint: 0xffffff },
  branch: {
    levels: null,
    trunkLength: null,
    trunkRadius: null,
    firstBranchAngle: null,
    secondBranchAngle: null,
    trunkChildren: null,
    branchChildren: null,
    trunkGnarliness: null,
    forceStrength: null,
  },
  leaves: {
    tint: 0xffffff,
    size: 2.5,
    count: null,
    start: null,
    sizeVariance: null,
    alphaTest: null,
    normalMode: 'canopy',
    normalStrength: 0.78,
    colorMode: 'gameGrass',
    colorVariation: 0.18,
    hueShift: 0,
    saturation: 1,
    brightness: 1,
  },
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null
}

export function normalizeTreeConfig(config = {}) {
  const position = config.position ?? {}
  const bark = config.bark ?? {}
  const branch = config.branch ?? {}
  const leaves = config.leaves ?? {}

  return {
    ...DEFAULT_TREE_CONFIG,
    ...config,
    preset: typeof config.preset === 'string' ? config.preset : DEFAULT_TREE_CONFIG.preset,
    position: {
      x: Number.isFinite(position.x) ? position.x : DEFAULT_TREE_CONFIG.position.x,
      y: Number.isFinite(position.y) ? position.y : DEFAULT_TREE_CONFIG.position.y,
      z: Number.isFinite(position.z) ? position.z : DEFAULT_TREE_CONFIG.position.z,
    },
    rotationY: Number.isFinite(config.rotationY) ? config.rotationY : DEFAULT_TREE_CONFIG.rotationY,
    scale: Number.isFinite(config.scale) ? config.scale : DEFAULT_TREE_CONFIG.scale,
    snapToGround: typeof config.snapToGround === 'boolean' ? config.snapToGround : DEFAULT_TREE_CONFIG.snapToGround,
    bark: {
      ...DEFAULT_TREE_CONFIG.bark,
      ...bark,
      tint: Number.isFinite(bark.tint) ? bark.tint : DEFAULT_TREE_CONFIG.bark.tint,
    },
    branch: {
      ...DEFAULT_TREE_CONFIG.branch,
      ...branch,
      levels: finiteOrNull(branch.levels),
      trunkLength: finiteOrNull(branch.trunkLength),
      trunkRadius: finiteOrNull(branch.trunkRadius),
      firstBranchAngle: finiteOrNull(branch.firstBranchAngle),
      secondBranchAngle: finiteOrNull(branch.secondBranchAngle),
      trunkChildren: finiteOrNull(branch.trunkChildren),
      branchChildren: finiteOrNull(branch.branchChildren),
      trunkGnarliness: finiteOrNull(branch.trunkGnarliness),
      forceStrength: finiteOrNull(branch.forceStrength),
    },
    leaves: {
      ...DEFAULT_TREE_CONFIG.leaves,
      ...leaves,
      tint: Number.isFinite(leaves.tint) ? leaves.tint : DEFAULT_TREE_CONFIG.leaves.tint,
      size: Number.isFinite(leaves.size) ? leaves.size : DEFAULT_TREE_CONFIG.leaves.size,
      count: finiteOrNull(leaves.count),
      start: finiteOrNull(leaves.start),
      sizeVariance: finiteOrNull(leaves.sizeVariance),
      alphaTest: finiteOrNull(leaves.alphaTest),
      normalMode: ['generated', 'upward', 'canopy'].includes(leaves.normalMode)
        ? leaves.normalMode
        : DEFAULT_TREE_CONFIG.leaves.normalMode,
      normalStrength: Number.isFinite(leaves.normalStrength)
        ? Math.max(0, Math.min(1, leaves.normalStrength))
        : DEFAULT_TREE_CONFIG.leaves.normalStrength,
      colorMode: ['gameGrass', 'ezTree'].includes(leaves.colorMode)
        ? leaves.colorMode
        : DEFAULT_TREE_CONFIG.leaves.colorMode,
      colorVariation: Number.isFinite(leaves.colorVariation)
        ? Math.max(0, Math.min(0.5, leaves.colorVariation))
        : DEFAULT_TREE_CONFIG.leaves.colorVariation,
      hueShift: Number.isFinite(leaves.hueShift)
        ? Math.max(-0.18, Math.min(0.18, leaves.hueShift))
        : DEFAULT_TREE_CONFIG.leaves.hueShift,
      saturation: Number.isFinite(leaves.saturation)
        ? Math.max(0.35, Math.min(1.8, leaves.saturation))
        : DEFAULT_TREE_CONFIG.leaves.saturation,
      brightness: Number.isFinite(leaves.brightness)
        ? Math.max(0.45, Math.min(1.6, leaves.brightness))
        : DEFAULT_TREE_CONFIG.leaves.brightness,
    },
  }
}

function applyTreeOptionOverrides(options, config) {
  const { branch, leaves } = config

  if (branch.levels !== null) options.branch.levels = Math.round(branch.levels)
  if (branch.trunkLength !== null) options.branch.length[0] = branch.trunkLength
  if (branch.trunkRadius !== null) options.branch.radius[0] = branch.trunkRadius
  if (branch.firstBranchAngle !== null) options.branch.angle[1] = branch.firstBranchAngle
  if (branch.secondBranchAngle !== null) options.branch.angle[2] = branch.secondBranchAngle
  if (branch.trunkChildren !== null) options.branch.children[0] = Math.round(branch.trunkChildren)
  if (branch.branchChildren !== null) options.branch.children[1] = Math.round(branch.branchChildren)
  if (branch.trunkGnarliness !== null) options.branch.gnarliness[0] = branch.trunkGnarliness
  if (branch.forceStrength !== null) options.branch.force.strength = branch.forceStrength

  if (leaves.count !== null) options.leaves.count = Math.round(leaves.count)
  if (leaves.start !== null) options.leaves.start = leaves.start
  if (leaves.sizeVariance !== null) options.leaves.sizeVariance = leaves.sizeVariance
  if (leaves.alphaTest !== null) options.leaves.alphaTest = leaves.alphaTest
}

function stylizeLeafNormals(tree, config) {
  const mode = config.leaves.normalMode
  const strength = config.leaves.normalStrength
  const geometry = tree.leavesMesh?.geometry
  const positionAttribute = geometry?.attributes?.position
  const normalAttribute = geometry?.attributes?.normal

  if (mode === 'generated' || strength <= 0 || !geometry || !positionAttribute || !normalAttribute) return

  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox ?? new Box3().setFromBufferAttribute(positionAttribute)
  const center = bounds.getCenter(new Vector3())
  const height = Math.max(0.001, bounds.max.y - bounds.min.y)
  const generated = new Vector3()
  const target = new Vector3()
  const position = new Vector3()
  const up = new Vector3(0, 1, 0)
  const normals = normalAttribute.array

  for (let index = 0; index < positionAttribute.count; index += 1) {
    generated.fromBufferAttribute(normalAttribute, index).normalize()

    if (mode === 'upward') {
      target.copy(up)
    } else {
      position.fromBufferAttribute(positionAttribute, index)
      target
        .set(
          position.x - center.x,
          (position.y - center.y) * 0.55 + height * 0.22,
          position.z - center.z,
        )
        .normalize()

      if (target.lengthSq() < 0.0001) target.copy(up)
    }

    generated.lerp(target, strength).normalize()
    normals[index * 3] = generated.x
    normals[index * 3 + 1] = generated.y
    normals[index * 3 + 2] = generated.z
  }

  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.attributes.normal.needsUpdate = true
}

function seededPositionNoise(x, y, z) {
  const value = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
  return value - Math.floor(value)
}

function applyLeafColorGrade(color, config) {
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  color.setHSL(
    (hsl.h + config.leaves.hueShift + 1) % 1,
    Math.max(0, Math.min(1, hsl.s * config.leaves.saturation)),
    Math.max(0, Math.min(1, hsl.l * config.leaves.brightness)),
  )
}

function stylizeLeafColors(tree, config, animated = false) {
  const { colorMode, colorVariation } = config.leaves
  const geometry = tree.leavesMesh?.geometry
  const material = tree.leavesMesh?.material
  const positionAttribute = geometry?.attributes?.position

  if (colorMode === 'ezTree' || !geometry || !material || !positionAttribute) return

  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox ?? new Box3().setFromBufferAttribute(positionAttribute)
  const height = Math.max(0.001, bounds.max.y - bounds.min.y)
  const position = new Vector3()
  const color = new Color()
  const colors = []

  for (let index = 0; index < positionAttribute.count; index += 1) {
    position.fromBufferAttribute(positionAttribute, index)
    const verticalT = Math.max(0, Math.min(1, (position.y - bounds.min.y) / height))
    const baseColor = verticalT < 0.55
      ? color.copy(leafBottomColor).lerp(leafMiddleColor, verticalT / 0.55)
      : color.copy(leafMiddleColor).lerp(leafTopColor, (verticalT - 0.55) / 0.45)
    const noise = seededPositionNoise(position.x, position.y, position.z)
    const variationTarget = noise < 0.5 ? leafCoolShade : leafWarmHighlight
    const variationAmount = Math.abs(noise - 0.5) * 2 * colorVariation

    baseColor.lerp(variationTarget, variationAmount)
    applyLeafColorGrade(baseColor, config)
    colors.push(baseColor.r, baseColor.g, baseColor.b)
  }

  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.attributes.color.needsUpdate = true
  const alphaTexture = material.map ?? null
  const stylizedMaterial = new MeshBasicMaterial({
    name: 'stylized-leaves',
    map: alphaTexture,
    alphaTest: material.alphaTest ?? 0.5,
    side: FrontSide,
    transparent: false,
    depthWrite: true,
    color: '#ffffff',
    vertexColors: true,
  })

  stylizedMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D(map, vMapUv);
        diffuseColor.a *= sampledDiffuseColor.a;
      #endif
      `,
    )

    if (!animated) return

    // Wind animation — all animated variants share the same uniform objects so one
    // treeLeafWindUniforms.uTime.value update per frame moves every tree's leaves.
    shader.uniforms.uTime = treeLeafWindUniforms.uTime
    shader.uniforms.uWindDirection = treeLeafWindUniforms.uWindDirection
    shader.uniforms.uWindStrength = treeLeafWindUniforms.uWindStrength
    shader.uniforms.uWindSpeed = treeLeafWindUniforms.uWindSpeed
    shader.uniforms.uWindScale = treeLeafWindUniforms.uWindScale
    shader.uniforms.uTreeHeight = treeLeafWindUniforms.uTreeHeight

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uTime;
      uniform vec3 uWindDirection;
      uniform float uWindStrength;
      uniform float uWindSpeed;
      uniform float uWindScale;
      uniform float uTreeHeight;
      `,
    )

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>

      #ifdef USE_INSTANCING
        vec3 treeOrigin = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
      #else
        vec3 treeOrigin = vec3(0.0);
      #endif

      // Height factor: leaves at the top of the canopy sway more than those at the base.
      float heightFactor = clamp(position.y / uTreeHeight, 0.0, 1.0);
      heightFactor = heightFactor * heightFactor;

      // Phase offset per tree (from world position) so neighbouring trees don't sway in sync.
      float travel = dot(treeOrigin.xz, uWindDirection.xz) * uWindScale;
      float windPhase = uTime * uWindSpeed - travel;

      float mainSway = sin(windPhase);
      float leafRustle = sin(windPhase * 2.37 + position.x * 0.07 + position.z * 0.05) * 0.28;
      float sway = mainSway + leafRustle;

      transformed.x += uWindDirection.x * sway * uWindStrength * heightFactor;
      transformed.z += uWindDirection.z * sway * uWindStrength * heightFactor;
      `,
    )
  }

  material.dispose()
  tree.leavesMesh.material = stylizedMaterial
}

export function createProceduralTree(config, animated = true) {
  const normalized = normalizeTreeConfig(config)
  const tree = new Tree()

  tree.loadPreset(normalized.preset)
  tree.options.seed = normalized.seed
  tree.options.bark.tint = normalized.bark.tint
  tree.options.leaves.tint = normalized.leaves.tint
  tree.options.leaves.size = normalized.leaves.size
  applyTreeOptionOverrides(tree.options, normalized)
  tree.generate()
  stylizeLeafNormals(tree, normalized)
  stylizeLeafColors(tree, normalized, animated)

  return tree
}

export function getTreeEditorValues(config) {
  const normalized = normalizeTreeConfig(config)
  const options = getPresetOptions(normalized.preset)
  applyTreeOptionOverrides(options, normalized)

  return {
    levels: options.branch.levels,
    trunkLength: options.branch.length[0],
    trunkRadius: options.branch.radius[0],
    firstBranchAngle: options.branch.angle[1],
    secondBranchAngle: options.branch.angle[2],
    trunkChildren: options.branch.children[0],
    branchChildren: options.branch.children[1],
    trunkGnarliness: options.branch.gnarliness[0],
    forceStrength: options.branch.force.strength,
    leafCount: options.leaves.count,
    leafStart: options.leaves.start,
    leafSizeVariance: options.leaves.sizeVariance,
    leafAlphaTest: options.leaves.alphaTest,
    leafSize: normalized.leaves.size,
    leafNormalMode: normalized.leaves.normalMode,
    leafNormalStrength: normalized.leaves.normalStrength,
    leafColorMode: normalized.leaves.colorMode,
    leafColorVariation: normalized.leaves.colorVariation,
    leafHueShift: normalized.leaves.hueShift,
    leafSaturation: normalized.leaves.saturation,
    leafBrightness: normalized.leaves.brightness,
  }
}

export function estimateTreeHeight(config) {
  const values = getTreeEditorValues(config)
  const branchContribution = values.levels > 1
    ? Math.min(values.trunkLength * 0.65, values.branchChildren * 2.4 + values.levels * 3)
    : 0
  const leafContribution = values.leafSize * 1.2

  return Math.max(2.5, (values.trunkLength + branchContribution + leafContribution) * normalizeTreeConfig(config).scale)
}
