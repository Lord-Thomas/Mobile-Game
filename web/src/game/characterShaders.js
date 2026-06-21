// Helpers purs de recoloration des matériaux du personnage (couleurs + GLSL).
// Extraits de App.jsx pour alléger le monolithe ; aucune dépendance React/Three.

export function srgbChannelToLinear(value) {
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4
}

// Convertit un hex sRGB en triplet linéaire pour les shaders Three.js.
export function charHexToVec(hex) {
  return [
    srgbChannelToLinear(parseInt(hex.slice(1, 3), 16) / 255),
    srgbChannelToLinear(parseInt(hex.slice(3, 5), 16) / 255),
    srgbChannelToLinear(parseInt(hex.slice(5, 7), 16) / 255),
  ]
}

export function getCharacterMaterialKey(materialName = '') {
  const normalized = materialName.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  if (normalized.includes('eye') || normalized.includes('mouth')) return null
  if (normalized.includes('skin')) return 'skin'
  if (normalized.includes('hair')) return 'hair'
  if (normalized.includes('shirt')) return 'shirt'
  if (normalized.includes('pants') && normalized.includes('detail')) return 'pants_details'
  if (normalized.includes('pants')) return 'pants'
  if (normalized.includes('shoe') || normalized.includes('boot')) return 'shoes'
  if (normalized.includes('sock') || normalized.includes('socket')) return 'socks'
  return null
}

export function normalizeMixamoObjectName(name = '') {
  return name.replace(/^mixamorig:/, 'mixamorig')
}

// Shader de recoloration par zone : remplace la teinte, conserve la luminosité.
// Ça évite qu'un t-shirt rouge devienne kaki quand on choisit du vert.

// Déclaration de l'uniform dans le fragment shader (inséré après #include <common>)
export const TINT_RECOLOR_UNIFORM_DECL = `#include <common>
uniform vec3 uZoneColor;
uniform vec3 uDetailColor;
uniform vec3 uEyeColor;
uniform vec3 uBrowColor;
uniform sampler2D uFaceDetailMask;`

// Code GLSL appliqué APRÈS le sampling de texture (remplace #include <map_fragment>)
// On garde #include <map_fragment> INTACT et on ajoute notre logique après
export function makeTintApplyGlsl(baseR, baseG, baseB) {
  const br = baseR.toFixed(5), bg = baseG.toFixed(5), bb = baseB.toFixed(5)
  return `#include <map_fragment>
vec3 _raw=diffuseColor.rgb;
vec3 _bC=vec3(${br},${bg},${bb});
vec3 _luma=vec3(0.2126,0.7152,0.0722);
float _baseL=max(dot(_bC,_luma),0.001);
float _pixelL=dot(_raw,_luma);
float _shade=clamp(_pixelL/_baseL,0.,2.4);
float _tintAmount=smoothstep(0.015,0.09,length(uZoneColor-_bC));
vec3 _tinted=clamp(uZoneColor*_shade,0.,1.);
diffuseColor.rgb=mix(_raw,_tinted,_tintAmount);`
}

export function makePantsDetailsTintApplyGlsl(baseR, baseG, baseB, detailBaseR, detailBaseG, detailBaseB) {
  const br = baseR.toFixed(5), bg = baseG.toFixed(5), bb = baseB.toFixed(5)
  const dr = detailBaseR.toFixed(5), dg = detailBaseG.toFixed(5), db = detailBaseB.toFixed(5)
  return `#include <map_fragment>
vec3 _luma=vec3(0.2126,0.7152,0.0722);
vec3 _pantsBase=vec3(${br},${bg},${bb});
vec3 _detailBase=vec3(${dr},${dg},${db});
float _pixelL=dot(diffuseColor.rgb,_luma);
float _pantsShade=clamp(_pixelL/max(dot(_pantsBase,_luma),0.001),0.,2.4);
float _detailShade=clamp(_pixelL/max(dot(_detailBase,_luma),0.001),0.,2.4);
float _yellow=max(min(diffuseColor.r,diffuseColor.g)-diffuseColor.b*1.35,0.);
float _warm=max(diffuseColor.r-diffuseColor.b,0.)+max(diffuseColor.g-diffuseColor.b,0.);
float _detailMask=smoothstep(0.08,0.28,_yellow+_warm*0.18);
vec3 _pantsColor=clamp(uZoneColor*_pantsShade,0.,1.);
vec3 _detailColor=clamp(uDetailColor*_detailShade,0.,1.);
diffuseColor.rgb=mix(_pantsColor,_detailColor,_detailMask);`
}

export function makeSkinWithDetailsTintApplyGlsl(baseR, baseG, baseB, eyeBaseR, eyeBaseG, eyeBaseB, browBaseR, browBaseG, browBaseB) {
  const br = baseR.toFixed(5), bg = baseG.toFixed(5), bb = baseB.toFixed(5)
  const er = eyeBaseR.toFixed(5), eg = eyeBaseG.toFixed(5), eb = eyeBaseB.toFixed(5)
  const yr = browBaseR.toFixed(5), yg = browBaseG.toFixed(5), yb = browBaseB.toFixed(5)
  return `#include <map_fragment>
vec3 _raw=diffuseColor.rgb;
vec3 _luma=vec3(0.2126,0.7152,0.0722);
vec3 _skinBase=vec3(${br},${bg},${bb});
vec3 _eyeBase=vec3(${er},${eg},${eb});
vec3 _browBase=vec3(${yr},${yg},${yb});
float _pixelL=dot(_raw,_luma);
float _skinShade=clamp(_pixelL/max(dot(_skinBase,_luma),0.001),0.,2.4);
float _skinAmount=smoothstep(0.015,0.09,length(uZoneColor-_skinBase));
vec3 _detailMask=texture2D(uFaceDetailMask,vMapUv).rgb;
float _eyeMask=clamp(_detailMask.r,0.,1.);
float _browMask=clamp(_detailMask.g*(1.0-_eyeMask),0.,1.);
float _skinProtectMask=clamp(max(max(_detailMask.r,_detailMask.g),_detailMask.b),0.,1.);
vec3 _skinTinted=mix(_raw,clamp(uZoneColor*_skinShade,0.,1.),_skinAmount);
vec3 _skinColor=mix(_skinTinted,_raw,_skinProtectMask);
float _eyeShade=clamp(_pixelL/max(dot(_eyeBase,_luma),0.001),0.,2.4);
float _browShade=clamp(_pixelL/max(dot(_browBase,_luma),0.001),0.,2.4);
float _eyeAmount=smoothstep(0.015,0.09,length(uEyeColor-_eyeBase));
float _browAmount=smoothstep(0.015,0.09,length(uBrowColor-_browBase));
vec3 _eyeColor=mix(_raw,clamp(uEyeColor*_eyeShade,0.,1.),_eyeAmount);
vec3 _browColor=mix(_raw,clamp(uBrowColor*_browShade,0.,1.),_browAmount);
diffuseColor.rgb=mix(_skinColor,_eyeColor,_eyeMask);
diffuseColor.rgb=mix(diffuseColor.rgb,_browColor,_browMask);`
}
