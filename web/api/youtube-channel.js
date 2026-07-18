import { createYouTubeChannelHandler } from '../server/youtubeChannel.js'

const handleYouTubeChannel = createYouTubeChannelHandler({
  apiKey: process.env.YOUTUBE_API_KEY,
  handle: process.env.YOUTUBE_CHANNEL_HANDLE,
})

export default handleYouTubeChannel
