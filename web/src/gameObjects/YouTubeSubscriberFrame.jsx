import { useEffect, useMemo, useState } from 'react'
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'
import { loadYouTubeChannel, YOUTUBE_CHANNEL_FALLBACK } from '../services/youtubeChannelService'

const REFRESH_INTERVAL_MS = 15 * 60 * 1000
const CANVAS_WIDTH = 1024
const CANVAS_HEIGHT = 576

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath()
  context.roundRect(x, y, width, height, radius)
  context.closePath()
}

function formatSubscriberCount(value) {
  if (!Number.isFinite(Number(value))) return 'Mise à jour en attente'
  return new Intl.NumberFormat('fr-FR').format(Number(value))
}

function drawYouTubeLogo(context, x, y, width, height) {
  context.fillStyle = '#ff0033'
  roundedRect(context, x, y, width, height, height * 0.25)
  context.fill()
  context.fillStyle = '#ffffff'
  context.beginPath()
  context.moveTo(x + width * 0.43, y + height * 0.28)
  context.lineTo(x + width * 0.43, y + height * 0.72)
  context.lineTo(x + width * 0.7, y + height * 0.5)
  context.closePath()
  context.fill()
}

function drawChannelCard(canvas, channel, avatar) {
  const context = canvas.getContext('2d')
  const gradient = context.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  gradient.addColorStop(0, '#17191d')
  gradient.addColorStop(1, '#070809')
  context.fillStyle = gradient
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  context.strokeStyle = '#ff0033'
  context.lineWidth = 12
  roundedRect(context, 18, 18, CANVAS_WIDTH - 36, CANVAS_HEIGHT - 36, 38)
  context.stroke()

  drawYouTubeLogo(context, 72, 62, 152, 104)
  context.fillStyle = '#ffffff'
  context.font = '700 54px Arial, sans-serif'
  context.fillText('YouTube', 248, 136)

  context.save()
  context.beginPath()
  context.arc(170, 338, 104, 0, Math.PI * 2)
  context.clip()
  if (avatar) {
    context.drawImage(avatar, 66, 234, 208, 208)
  } else {
    const avatarGradient = context.createLinearGradient(66, 234, 274, 442)
    avatarGradient.addColorStop(0, '#ff335c')
    avatarGradient.addColorStop(1, '#8d001d')
    context.fillStyle = avatarGradient
    context.fillRect(66, 234, 208, 208)
    context.fillStyle = '#ffffff'
    context.font = '700 112px Arial, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('T', 170, 346)
  }
  context.restore()
  context.strokeStyle = '#ffffff'
  context.lineWidth = 8
  context.beginPath()
  context.arc(170, 338, 108, 0, Math.PI * 2)
  context.stroke()

  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = '#ffffff'
  context.font = '700 62px Arial, sans-serif'
  context.fillText(channel.title || 'Thoms_gail', 320, 292)
  context.fillStyle = '#b7bbc3'
  context.font = '400 34px Arial, sans-serif'
  context.fillText(channel.handle || '@Thoms_gail', 322, 344)
  context.fillStyle = '#ffffff'
  context.font = '700 68px Arial, sans-serif'
  context.fillText(formatSubscriberCount(channel.subscriberCount), 320, 422)
  context.fillStyle = '#b7bbc3'
  context.font = '500 30px Arial, sans-serif'
  context.fillText('abonnés', 324, 470)
}

export default function YouTubeSubscriberFrame({ width = 1.5, height = 0.86, depth = 0.07 }) {
  const [channel, setChannel] = useState(YOUTUBE_CHANNEL_FALLBACK)
  const [avatar, setAvatar] = useState(null)
  const texture = useMemo(() => {
    const element = document.createElement('canvas')
    element.width = CANVAS_WIDTH
    element.height = CANVAS_HEIGHT
    drawChannelCard(element, channel, avatar)
    const value = new CanvasTexture(element)
    value.colorSpace = SRGBColorSpace
    value.minFilter = LinearFilter
    value.magFilter = LinearFilter
    return value
  }, [avatar, channel])

  useEffect(() => () => texture.dispose(), [texture])

  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => {
      loadYouTubeChannel(controller.signal)
        .then(setChannel)
        .catch(() => setChannel((current) => current ?? YOUTUBE_CHANNEL_FALLBACK))
    }
    refresh()
    const intervalId = window.setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    if (!channel.thumbnailDataUrl) return undefined
    const image = new Image()
    image.onload = () => setAvatar(image)
    image.onerror = () => setAvatar(null)
    image.src = channel.thumbnailDataUrl
    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [channel.thumbnailDataUrl])

  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#17191d" roughness={0.34} metalness={0.68} />
      </mesh>
      <mesh position={[0, 0, depth * 0.5 + 0.002]}>
        <planeGeometry args={[width - 0.08, height - 0.08]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  )
}
