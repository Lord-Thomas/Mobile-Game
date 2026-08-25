import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useTexture } from '@react-three/drei'
import {
  BufferGeometry,
  Color,
  DataTexture,
  Float32BufferAttribute,
  NearestFilter,
  Object3D,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
} from 'three'
import {
  getTerrainHeight,
  TERRAIN_HALF_SIZE,
  TERRAIN_VISUAL_SEGMENTS,
} from './terrain/terrainGeometry'
import { DEFAULT_PATH_HARDNESS, DEFAULT_PATH_OPACITY, PATH_TYPES } from './paths'
import {
  getArtDirectionColorMultiplier,
  useArtDirectionValues,
} from '../artDirection/artDirectionStore'

// Every material remains one instanced draw call. A moderately tessellated disk
// gives the height shader enough vertices to follow hills without rebuilding a
// separate geometry for every brush sample.
const PATH_CAPACITY = 8192
const PATH_Y_OFFSET = 0.045
const PATH_LAYER_SPAN = 0.035
const PATH_RADIAL_SEGMENTS = 10
const PATH_ANGULAR_SEGMENTS = 40
// Strictement la même grille que le terrain visuel : 256 cellules = 257
// sommets, de -TERRAIN_HALF_SIZE à +TERRAIN_HALF_SIZE.
const HEIGHT_FIELD_SIZE = TERRAIN_VISUAL_SEGMENTS + 1
const HEIGHT_FIELD_WORLD_SIZE = TERRAIN_HALF_SIZE * 2
const dummy = new Object3D()
const PATH_TEXTURE_URLS = [...new Set(
  Object.values(PATH_TYPES).flatMap(({ map, normalMap, roughnessMap }) => [map, normalMap, roughnessMap]),
)]
const PATH_NORMAL_SCALE = new Vector2(0.55, 0.55)
const TERRAIN_NORMAL_SCALE = new Vector2(0.34, 0.34)
const NO_TERRAIN_GRADE = Object.freeze({
  target: [1, 1, 1],
  luminanceScale: 1,
  luminanceBias: 0,
  luminanceMax: 1,
  amount: 0,
})

function createPathDiskGeometry() {
  const geometry = new BufferGeometry()
  const positions = [0, 0, 0]
  const normals = [0, 0, 1]
  const uvs = [0.5, 0.5]
  const indices = []

  for (let ring = 1; ring <= PATH_RADIAL_SEGMENTS; ring += 1) {
    const radius = (ring / PATH_RADIAL_SEGMENTS) * 0.5
    for (let segment = 0; segment < PATH_ANGULAR_SEGMENTS; segment += 1) {
      const angle = (segment / PATH_ANGULAR_SEGMENTS) * Math.PI * 2
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius
      positions.push(x, y, 0)
      normals.push(0, 0, 1)
      uvs.push(x + 0.5, y + 0.5)
    }
  }

  const ringVertex = (ring, segment) => (
    1 + ((ring - 1) * PATH_ANGULAR_SEGMENTS) + (segment % PATH_ANGULAR_SEGMENTS)
  )
  for (let segment = 0; segment < PATH_ANGULAR_SEGMENTS; segment += 1) {
    indices.push(0, ringVertex(1, segment), ringVertex(1, segment + 1))
  }
  for (let ring = 2; ring <= PATH_RADIAL_SEGMENTS; ring += 1) {
    for (let segment = 0; segment < PATH_ANGULAR_SEGMENTS; segment += 1) {
      const innerA = ringVertex(ring - 1, segment)
      const innerB = ringVertex(ring - 1, segment + 1)
      const outerA = ringVertex(ring, segment)
      const outerB = ringVertex(ring, segment + 1)
      indices.push(innerA, outerA, innerB, innerB, outerA, outerB)
    }
  }

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

function createTerrainHeightField(terrainVersion = 0) {
  const heights = new Float32Array(HEIGHT_FIELD_SIZE * HEIGHT_FIELD_SIZE)
  let minHeight = Infinity
  let maxHeight = -Infinity

  for (let zIndex = 0; zIndex < HEIGHT_FIELD_SIZE; zIndex += 1) {
    const z = -TERRAIN_HALF_SIZE + (zIndex / (HEIGHT_FIELD_SIZE - 1)) * HEIGHT_FIELD_WORLD_SIZE
    for (let xIndex = 0; xIndex < HEIGHT_FIELD_SIZE; xIndex += 1) {
      const x = -TERRAIN_HALF_SIZE + (xIndex / (HEIGHT_FIELD_SIZE - 1)) * HEIGHT_FIELD_WORLD_SIZE
      const height = getTerrainHeight(x, z)
      const index = zIndex * HEIGHT_FIELD_SIZE + xIndex
      heights[index] = height
      minHeight = Math.min(minHeight, height)
      maxHeight = Math.max(maxHeight, height)
    }
  }

  // Two 8-bit channels encode a 16-bit normalized height. The shader reproduit
  // ensuite l'interpolation des triangles du terrain, sans texture float mobile.
  const paddedMin = minHeight - 0.25
  const paddedMax = maxHeight + 0.25
  const heightRange = Math.max(0.001, paddedMax - paddedMin)
  const data = new Uint8Array(HEIGHT_FIELD_SIZE * HEIGHT_FIELD_SIZE * 4)
  for (let index = 0; index < heights.length; index += 1) {
    const encoded = Math.round(((heights[index] - paddedMin) / heightRange) * 65535)
    const offset = index * 4
    data[offset] = (encoded >> 8) & 255
    data[offset + 1] = encoded & 255
    data[offset + 2] = 0
    data[offset + 3] = 255
  }

  const texture = new DataTexture(
    data,
    HEIGHT_FIELD_SIZE,
    HEIGHT_FIELD_SIZE,
    RGBAFormat,
    UnsignedByteType,
  )
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.generateMipmaps = false
  texture.userData.terrainVersion = terrainVersion
  texture.needsUpdate = true
  return { texture, minHeight: paddedMin, maxHeight: paddedMax }
}

function cloneSurfaceTexture(source, { color = false } = {}) {
  const texture = source.clone()
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  if (color) texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function PathTexturePreloader() {
  useTexture(PATH_TEXTURE_URLS)
  return null
}

function PathLayer({ stamps, definition, heightField, terrainSurface, terrainTint }) {
  const meshRef = useRef()
  const materialRef = useRef()
  const hardnessAttributeRef = useRef()
  const opacityAttributeRef = useRef()
  const paintOrderAttributeRef = useRef()
  const hardnessValues = useMemo(() => new Float32Array(PATH_CAPACITY), [])
  const opacityValues = useMemo(() => new Float32Array(PATH_CAPACITY), [])
  const paintOrderValues = useMemo(() => new Float32Array(PATH_CAPACITY), [])
  const geometry = useMemo(() => createPathDiskGeometry(), [])
  const terrainTintRef = useRef(terrainTint)
  const grade = definition.terrainGrade ?? NO_TERRAIN_GRADE
  const gradeTarget = useMemo(() => new Vector3(...grade.target), [grade])
  const [sourceMap, sourceNormalMap, sourceRoughnessMap] = useTexture([
    definition.map,
    definition.normalMap,
    definition.roughnessMap,
  ])
  const map = useMemo(() => cloneSurfaceTexture(sourceMap, { color: true }), [sourceMap])
  const normalMap = useMemo(() => cloneSurfaceTexture(sourceNormalMap), [sourceNormalMap])
  const roughnessMap = useMemo(() => cloneSurfaceTexture(sourceRoughnessMap), [sourceRoughnessMap])

  const handleBeforeCompile = useMemo(() => function handleBeforeCompile(shader) {
    shader.uniforms.uPaintGradeTarget = { value: gradeTarget.clone() }
    shader.uniforms.uPaintLuminanceScale = { value: grade.luminanceScale }
    shader.uniforms.uPaintLuminanceBias = { value: grade.luminanceBias }
    shader.uniforms.uPaintLuminanceMax = { value: grade.luminanceMax }
    shader.uniforms.uPaintGradeAmount = { value: grade.amount }
    shader.uniforms.uPaintTerrainTint = { value: terrainTintRef.current.clone() }
    shader.uniforms.uPaintTextureScale = { value: definition.textureScale ?? 0.18 }
    shader.uniforms.uPaintHeightMap = { value: heightField.texture }
    shader.uniforms.uPaintHeightRange = {
      value: new Vector2(heightField.minHeight, heightField.maxHeight),
    }
    shader.uniforms.uPaintHeightMapSize = { value: HEIGHT_FIELD_SIZE }
    shader.uniforms.uPaintWorldHalfSize = { value: TERRAIN_HALF_SIZE }

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>
      attribute float instanceHardness;
      attribute float instanceOpacity;
      attribute float instancePaintOrder;
      uniform sampler2D uPaintHeightMap;
      uniform vec2 uPaintHeightRange;
      uniform float uPaintHeightMapSize;
      uniform float uPaintWorldHalfSize;
      varying float vPaintHardness;
      varying float vPaintOpacity;
      varying vec3 vPaintWorldPosition;

      float decodePaintHeight(vec4 sampleValue) {
        float encoded = sampleValue.r * 65280.0 + sampleValue.g * 255.0;
        return mix(uPaintHeightRange.x, uPaintHeightRange.y, encoded / 65535.0);
      }

      float samplePaintTerrainHeight(vec2 worldXZ) {
        vec2 mapUv = clamp(
          (worldXZ + vec2(uPaintWorldHalfSize)) / (uPaintWorldHalfSize * 2.0),
          vec2(0.0),
          vec2(1.0)
        );
        vec2 texelPosition = mapUv * (uPaintHeightMapSize - 1.0);
        vec2 baseTexel = floor(texelPosition);
        vec2 fraction = fract(texelPosition);
        vec2 maxTexel = vec2(uPaintHeightMapSize - 1.0);
        vec2 uv00 = (min(baseTexel, maxTexel) + 0.5) / uPaintHeightMapSize;
        vec2 uv10 = (min(baseTexel + vec2(1.0, 0.0), maxTexel) + 0.5) / uPaintHeightMapSize;
        vec2 uv01 = (min(baseTexel + vec2(0.0, 1.0), maxTexel) + 0.5) / uPaintHeightMapSize;
        vec2 uv11 = (min(baseTexel + vec2(1.0), maxTexel) + 0.5) / uPaintHeightMapSize;
        float h00 = decodePaintHeight(texture2D(uPaintHeightMap, uv00));
        float h10 = decodePaintHeight(texture2D(uPaintHeightMap, uv10));
        float h01 = decodePaintHeight(texture2D(uPaintHeightMap, uv01));
        float h11 = decodePaintHeight(texture2D(uPaintHeightMap, uv11));
        // Reproduit exactement les deux triangles (a,c,b) et (b,c,d) utilisés
        // par createTerrainGeometry, au lieu de lisser le quad en bilinéaire.
        if (fraction.x + fraction.y <= 1.0) {
          return h00
            + (h10 - h00) * fraction.x
            + (h01 - h00) * fraction.y;
        }
        return h11
          + (h01 - h11) * (1.0 - fraction.x)
          + (h10 - h11) * (1.0 - fraction.y);
      }
      `,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vPaintHardness = instanceHardness;
      vPaintOpacity = instanceOpacity;
      `,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <defaultnormal_vertex>',
      `
      #include <defaultnormal_vertex>
      vec4 paintNormalPosition = instanceMatrix * vec4(position, 1.0);
      float paintNormalStep = (uPaintWorldHalfSize * 2.0) / (uPaintHeightMapSize - 1.0);
      float paintHeightLeft = samplePaintTerrainHeight(paintNormalPosition.xz - vec2(paintNormalStep, 0.0));
      float paintHeightRight = samplePaintTerrainHeight(paintNormalPosition.xz + vec2(paintNormalStep, 0.0));
      float paintHeightDown = samplePaintTerrainHeight(paintNormalPosition.xz - vec2(0.0, paintNormalStep));
      float paintHeightUp = samplePaintTerrainHeight(paintNormalPosition.xz + vec2(0.0, paintNormalStep));
      vec3 paintTerrainNormal = normalize(vec3(
        paintHeightLeft - paintHeightRight,
        paintNormalStep * 2.0,
        paintHeightDown - paintHeightUp
      ));
      transformedNormal = normalize(normalMatrix * paintTerrainNormal);
      `,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 paintWorldPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        paintWorldPosition = instanceMatrix * paintWorldPosition;
      #endif
      paintWorldPosition.y = samplePaintTerrainHeight(paintWorldPosition.xz)
        + ${PATH_Y_OFFSET.toFixed(3)}
        + instancePaintOrder * ${PATH_LAYER_SPAN.toFixed(3)};
      vPaintWorldPosition = paintWorldPosition.xyz;
      vec4 mvPosition = modelViewMatrix * paintWorldPosition;
      gl_Position = projectionMatrix * mvPosition;
      `,
    )

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
      #include <common>
      uniform vec3 uPaintGradeTarget;
      uniform float uPaintLuminanceScale;
      uniform float uPaintLuminanceBias;
      uniform float uPaintLuminanceMax;
      uniform float uPaintGradeAmount;
      uniform vec3 uPaintTerrainTint;
      uniform float uPaintTextureScale;
      varying float vPaintHardness;
      varying float vPaintOpacity;
      varying vec3 vPaintWorldPosition;
      `,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      #ifdef USE_MAP
        vec4 sampledDiffuseColor = texture2D(map, vPaintWorldPosition.xz * uPaintTextureScale);
        #ifdef DECODE_VIDEO_TEXTURE
          sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
        #endif
        diffuseColor *= sampledDiffuseColor;
      #endif
      float paintLuminance = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      vec3 paintGraded = mix(
        diffuseColor.rgb,
        uPaintGradeTarget * clamp(
          paintLuminance * uPaintLuminanceScale + uPaintLuminanceBias,
          0.0,
          uPaintLuminanceMax
        ),
        uPaintGradeAmount
      );
      diffuseColor.rgb = paintGraded * uPaintTerrainTint;
      float paintRadius = length(vMapUv - vec2(0.5)) * 2.0;
      float paintFeather = mix(0.45, 0.025, clamp(vPaintHardness, 0.0, 1.0));
      float paintEdgeAlpha = 1.0 - smoothstep(1.0 - paintFeather, 1.0, paintRadius);
      float paintCoverage = paintEdgeAlpha * clamp(vPaintOpacity, 0.0, 1.0);
      vec2 paintCoverageCell = floor(vPaintWorldPosition.xz * 18.0);
      float paintCoverageThreshold = fract(
        sin(dot(paintCoverageCell, vec2(12.9898, 78.233))) * 43758.5453
      );
      // Couverture déterministe ancrée dans le monde : deux disques qui se
      // chevauchent utilisent le même masque et ne cumulent plus leur opacité.
      if (paintCoverage < 0.001 || paintCoverageThreshold > paintCoverage) discard;
      diffuseColor.a = 1.0;
      `,
    )
    shader.fragmentShader = shader.fragmentShader
      .replaceAll(
        'texture2D( normalMap, vNormalMapUv )',
        'texture2D(normalMap, vPaintWorldPosition.xz * uPaintTextureScale)',
      )
      .replaceAll(
        'texture2D( roughnessMap, vRoughnessMapUv )',
        'texture2D(roughnessMap, vPaintWorldPosition.xz * uPaintTextureScale)',
      )

    const material = materialRef.current ?? this
    if (material) material.userData.shader = shader
  }, [definition.textureScale, grade, gradeTarget, heightField])

  useEffect(() => () => {
    geometry.dispose()
    map.dispose()
    normalMap.dispose()
    roughnessMap.dispose()
  }, [geometry, map, normalMap, roughnessMap])

  useEffect(() => {
    terrainTintRef.current.copy(terrainTint)
    const material = materialRef.current
    const shader = material?.userData?.shader
    if (shader?.uniforms.uPaintTerrainTint) {
      shader.uniforms.uPaintTerrainTint.value.copy(terrainTint)
    }
    if (definition.terrainGrade && material?.isMeshStandardMaterial) {
      material.roughness = terrainSurface.roughness
    }
  }, [definition.terrainGrade, terrainSurface.roughness, terrainTint])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    const hardnessAttribute = hardnessAttributeRef.current
    const opacityAttribute = opacityAttributeRef.current
    const paintOrderAttribute = paintOrderAttributeRef.current
    if (!mesh || !hardnessAttribute || !opacityAttribute || !paintOrderAttribute) return
    const count = Math.min(stamps.length, PATH_CAPACITY)

    for (let i = 0; i < count; i += 1) {
      const stamp = stamps[i]
      const [x, z] = stamp.center
      dummy.position.set(x, 0, z)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.set(stamp.width, stamp.width, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      hardnessAttribute.setX(i, stamp.hardness ?? DEFAULT_PATH_HARDNESS)
      opacityAttribute.setX(i, stamp.opacity ?? DEFAULT_PATH_OPACITY)
      paintOrderAttribute.setX(i, stamp.paintOrder ?? 0)
    }

    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    hardnessAttribute.needsUpdate = true
    opacityAttribute.needsUpdate = true
    paintOrderAttribute.needsUpdate = true
  }, [stamps])

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, PATH_CAPACITY]}
      frustumCulled={false}
      receiveShadow
      geometry={geometry}
      renderOrder={Math.ceil((stamps.at(-1)?.paintOrder ?? 0) * 100000)}
    >
      <instancedBufferAttribute
        ref={hardnessAttributeRef}
        attach="geometry-attributes-instanceHardness"
        args={[hardnessValues, 1]}
      />
      <instancedBufferAttribute
        ref={opacityAttributeRef}
        attach="geometry-attributes-instanceOpacity"
        args={[opacityValues, 1]}
      />
      <instancedBufferAttribute
        ref={paintOrderAttributeRef}
        attach="geometry-attributes-instancePaintOrder"
        args={[paintOrderValues, 1]}
      />
      <meshStandardMaterial
        ref={materialRef}
        map={map}
        normalMap={normalMap}
        normalScale={definition.terrainGrade ? TERRAIN_NORMAL_SCALE : PATH_NORMAL_SCALE}
        roughnessMap={definition.terrainGrade ? null : roughnessMap}
        color={definition.tint ?? '#ffffff'}
        emissive={definition.terrainGrade ? '#328f22' : '#000000'}
        emissiveIntensity={definition.terrainGrade ? 0.05 : 0}
        roughness={definition.terrainGrade ? terrainSurface.roughness : 1}
        metalness={0}
        depthWrite
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        onBeforeCompile={handleBeforeCompile}
      />
    </instancedMesh>
  )
}

function PaintedPathLayers({ paths, terrainVersion, preloadTextures = false }) {
  const artDirection = useArtDirectionValues()
  const terrainSurface = artDirection.surfaces.terrain
  const terrainTint = useMemo(() => {
    const [r, g, b] = getArtDirectionColorMultiplier('terrain', terrainSurface.color)
    return new Color().setRGB(r, g, b)
  }, [terrainSurface.color])
  const heightField = useMemo(() => createTerrainHeightField(terrainVersion), [terrainVersion])

  useEffect(() => () => heightField.texture.dispose(), [heightField])

  const byType = useMemo(() => {
    const groups = {}
    const denominator = Math.max(1, paths.length)
    paths.forEach((stamp, index) => {
      const type = PATH_TYPES[stamp.type] ? stamp.type : 'dirt'
      if (!groups[type]) groups[type] = []
      groups[type].push({ ...stamp, paintOrder: (index + 1) / denominator })
    })
    return groups
  }, [paths])

  return (
    <group userData={{ debugCategory: 'paths' }}>
      {preloadTextures && <PathTexturePreloader />}
      {Object.entries(byType).map(([type, stamps]) => (
        <PathLayer
          key={`${type}-${terrainVersion}`}
          stamps={stamps}
          definition={PATH_TYPES[type]}
          heightField={heightField}
          terrainSurface={terrainSurface}
          terrainTint={terrainTint}
        />
      ))}
    </group>
  )
}

export default function PaintedPaths({
  paths = [],
  terrainVersion = 0,
  preloadHeightField = false,
}) {
  // The game pays no height-field cost on maps without painted surfaces. The
  // editor opts into preloading so the first brush stroke never creates a hitch.
  if (!preloadHeightField && paths.length === 0) return null
  return (
    <PaintedPathLayers
      paths={paths}
      terrainVersion={terrainVersion}
      preloadTextures={preloadHeightField}
    />
  )
}
