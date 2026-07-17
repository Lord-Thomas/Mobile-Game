import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'
import { loadTikTokProfile, TIKTOK_PROFILE_FALLBACK } from '../services/tiktokProfileService'

const REFRESH_INTERVAL_MS = 15 * 60 * 1000
const CANVAS_WIDTH = 1024
const CANVAS_HEIGHT = 576

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
  context.closePath()
}

function formatFollowerCount(value) {
  if (!Number.isFinite(Number(value))) return 'Mise à jour en attente'
  return new Intl.NumberFormat('fr-FR').format(Number(value))
}

function drawTikTokLogo(context, x, y, size) {
  context.save()
  context.lineWidth = size * 0.15
  context.lineCap = 'round'
  context.lineJoin = 'round'
  const drawNote = (color, offsetX, offsetY) => {
    context.strokeStyle = color
    context.beginPath()
    context.moveTo(x + size * 0.6 + offsetX, y + size * 0.12 + offsetY)
    context.lineTo(x + size * 0.6 + offsetX, y + size * 0.68 + offsetY)
    context.arc(x + size * 0.39 + offsetX, y + size * 0.7 + offsetY, size * 0.21, 0, Math.PI * 2)
    context.moveTo(x + size * 0.6 + offsetX, y + size * 0.16 + offsetY)
    context.quadraticCurveTo(x + size * 0.72 + offsetX, y + size * 0.35 + offsetY, x + size * 0.88 + offsetX, y + size * 0.34 + offsetY)
    context.stroke()
  }
  drawNote('#25f4ee', -size * 0.035, size * 0.035)
  drawNote('#fe2c55', size * 0.035, -size * 0.035)
  drawNote('#ffffff', 0, 0)
  context.restore()
}

function fitText(context, text, maxWidth, startSize) {
  let size = startSize
  do {
    context.font = `700 ${size}px Arial, sans-serif`
    if (context.measureText(text).width <= maxWidth) return
    size -= 2
  } while (size > 28)
}

function drawProfileCard(canvas, profile, avatar) {
  const context = canvas.getContext('2d')
  const gradient = context.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  gradient.addColorStop(0, '#18191d')
  gradient.addColorStop(1, '#08090b')
  context.fillStyle = gradient
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  context.strokeStyle = '#25f4ee'
  context.lineWidth = 12
  roundedRect(context, 18, 18, CANVAS_WIDTH - 36, CANVAS_HEIGHT - 36, 38)
  context.stroke()
  context.strokeStyle = '#fe2c55'
  context.lineWidth = 5
  roundedRect(context, 31, 31, CANVAS_WIDTH - 62, CANVAS_HEIGHT - 62, 30)
  context.stroke()

  drawTikTokLogo(context, 66, 50, 126)
  context.fillStyle = '#ffffff'
  context.font = '700 58px Arial, sans-serif'
  context.fillText('TikTok', 225, 132)

  context.save()
  context.beginPath()
  context.arc(178, 346, 108, 0, Math.PI * 2)
  context.clip()
  if (avatar) {
    const imageWidth = avatar.naturalWidth || avatar.width
    const imageHeight = avatar.naturalHeight || avatar.height
    const side = Math.min(imageWidth, imageHeight)
    context.drawImage(avatar, (imageWidth - side) / 2, (imageHeight - side) / 2, side, side, 70, 238, 216, 216)
  } else {
    const avatarGradient = context.createLinearGradient(70, 238, 286, 454)
    avatarGradient.addColorStop(0, '#25f4ee')
    avatarGradient.addColorStop(1, '#fe2c55')
    context.fillStyle = avatarGradient
    context.fillRect(70, 238, 216, 216)
    context.fillStyle = '#ffffff'
    context.font = '700 100px Arial, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText((profile.displayName || profile.handle || 'T').replace(/^@/, '').charAt(0).toUpperCase(), 178, 350)
  }
  context.restore()
  context.strokeStyle = '#ffffff'
  context.lineWidth = 8
  context.beginPath()
  context.arc(178, 346, 112, 0, Math.PI * 2)
  context.stroke()

  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = '#ffffff'
  const displayName = profile.displayName || 'Thoms Gail'
  fitText(context, displayName, 620, 62)
  context.fillText(displayName, 338, 292)
  context.fillStyle = '#aeb2ba'
  context.font = '400 36px Arial, sans-serif'
  context.fillText(profile.handle || '@thoms.gail', 340, 345)
  context.fillStyle = '#ffffff'
  context.font = '700 70px Arial, sans-serif'
  context.fillText(formatFollowerCount(profile.followerCount), 338, 430)
  context.fillStyle = '#aeb2ba'
  context.font = '500 30px Arial, sans-serif'
  context.fillText('abonnés', 342, 480)
}

export default function TikTokCreatorFrame({ width = 1.5, height = 0.86, depth = 0.07, profileUrl = TIKTOK_PROFILE_FALLBACK.profileUrl }) {
  const [profile, setProfile] = useState({ ...TIKTOK_PROFILE_FALLBACK, profileUrl })
  const [avatar, setAvatar] = useState(null)
  const screenHeight = height - 0.08
  const screenWidth = Math.min(width - 0.08, screenHeight * (CANVAS_WIDTH / CANVAS_HEIGHT))
  const texture = useMemo(() => {
    const element = document.createElement('canvas')
    element.width = CANVAS_WIDTH
    element.height = CANVAS_HEIGHT
    drawProfileCard(element, profile, avatar)
    const value = new CanvasTexture(element)
    value.colorSpace = SRGBColorSpace
    value.minFilter = LinearFilter
    value.magFilter = LinearFilter
    return value
  }, [avatar, profile])

  useEffect(() => () => texture.dispose(), [texture])

  useEffect(() => {
    const controller = new AbortController()
    setProfile({ ...TIKTOK_PROFILE_FALLBACK, profileUrl })
    setAvatar(null)
    const refresh = () => loadTikTokProfile(profileUrl, controller.signal).then(setProfile).catch(() => {})
    refresh()
    const intervalId = window.setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [profileUrl])

  useEffect(() => {
    if (!profile.avatarDataUrl) return undefined
    const image = new Image()
    image.onload = () => setAvatar(image)
    image.onerror = () => setAvatar(null)
    image.src = profile.avatarDataUrl
    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [profile.avatarDataUrl])

  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#101114" roughness={0.3} metalness={0.72} />
      </mesh>
      <mesh position={[0, 0, depth * 0.5 + 0.002]}>
        <planeGeometry args={[screenWidth, screenHeight]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}
