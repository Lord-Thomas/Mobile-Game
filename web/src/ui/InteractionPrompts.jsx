import { useGameStore } from '../stores/useGameStore'

// Invites d'interaction du bas d'écran (porte, apprentissage du crâne, stations
// ballon/déco/perso, TV, s'asseoir/se relever).
//
// Chantier Zustand — extraction d'App() : ce composant regroupe les invites de
// proximité, jusqu'ici éparpillées dans le JSX géant d'App. Il s'abonne LUI-MÊME
// aux flags de proximité et de menus (store) ; le reste (mode, zone, droits,
// handlers) arrive en props depuis App.
//
// NB : App lit encore ces mêmes flags ailleurs (marqueurs de scène 3D +
// hasBottomInteractionPrompt), donc App re-rend encore sur la proximité tant que
// ces lecteurs-là ne sont pas eux aussi détachés. Ce commit isole l'UI (vélocité) ;
// l'élimination du re-render viendra quand les marqueurs s'abonneront seuls.
//
// Les booléens de zone sont passés précalculés (isOutsideZone) pour découpler ce
// composant de la constante ZONES locale à App.
export default function InteractionPrompts({
  showCaptureUi,
  modePlay,
  isOutsideZone,
  canModifyWorld,
  magicSkullDiscovered,
  isLearningMagicSkull,
  seatedPhase,
  onOutdoorToggle,
  onLearnSkull,
  onOpenSkinMenu,
  onOpenEnvironmentMenu,
  onOpenCustomizationChoice,
  onRequestTv,
  youtubeFrameEditorOpen,
  onEditYouTubeFrame,
  onRequestSit,
  onRequestStandUp,
  onTalk,
  contextWindowOpen = false,
}) {
  const nearOutdoorDoor = useGameStore((s) => s.near.outdoorDoor ?? false)
  const nearMagicSkull = useGameStore((s) => s.near.magicSkullDiscovery ?? false)
  const nearSkinStation = useGameStore((s) => s.near.skinStation ?? false)
  const nearEnvironmentStation = useGameStore((s) => s.near.environmentStation ?? false)
  const nearCustomizationStation = useGameStore((s) => s.near.customizationStation ?? false)
  const nearTv = useGameStore((s) => s.near.tv ?? null)
  const nearYouTubeFrame = useGameStore((s) => s.near.youtubeFrame ?? null)
  const nearSeat = useGameStore((s) => s.near.seat ?? null)
  const nearbyQuestNpcId = useGameStore((s) => s.near.questNpcId ?? null)

  const menuSkin = useGameStore((s) => s.menus.skin ?? false)
  const menuEnvironment = useGameStore((s) => s.menus.environment ?? false)
  const menuCustomizationChoice = useGameStore((s) => s.menus.customizationChoice ?? false)
  const menuCharacter = useGameStore((s) => s.menus.character ?? false)

  const noChoiceMenu = !menuSkin && !menuEnvironment && !menuCustomizationChoice && !menuCharacter && !contextWindowOpen

  if (!showCaptureUi || !modePlay || !noChoiceMenu) return null

  // Une seule action contextuelle peut occuper ce slot. L'ordre encode la
  // priorité lorsque plusieurs volumes de proximité se chevauchent.
  const action =
    seatedPhase === 'sitting'
      ? { key: 'stand', label: 'Se relever', className: 'seat-open-btn', onClick: onRequestStandUp }
      : nearbyQuestNpcId
        ? { key: 'talk', label: 'Parler', className: 'custom-open-btn', onClick: onTalk }
        : isOutsideZone && nearMagicSkull && !magicSkullDiscovered
          ? {
              key: 'learn',
              label: isLearningMagicSkull ? 'Apprentissage...' : 'Apprendre',
              className: 'custom-open-btn',
              onClick: onLearnSkull,
              disabled: isLearningMagicSkull,
            }
          : nearOutdoorDoor
            ? { key: 'door', label: isOutsideZone ? 'Entrer' : 'Sortir', className: 'outdoor-open-btn', onClick: onOutdoorToggle }
            : nearSeat && !seatedPhase
              ? { key: 'sit', label: "S'asseoir", className: 'seat-open-btn', onClick: onRequestSit }
              : canModifyWorld && nearYouTubeFrame && !youtubeFrameEditorOpen
                ? {
                    key: 'frame',
                    label: nearYouTubeFrame.objectId === 'tiktok_profile_frame' ? 'Modifier le profil TikTok' : 'Modifier la chaîne',
                    className: 'youtube-frame-open-btn',
                    onClick: onEditYouTubeFrame,
                  }
                : canModifyWorld && nearTv
                  ? { key: 'tv', label: 'TV', className: 'tv-open-btn', onClick: onRequestTv }
                  : nearSkinStation
                    ? { key: 'skin', label: 'Personnaliser le ballon', className: '', onClick: onOpenSkinMenu }
                    : !isOutsideZone && nearEnvironmentStation
                      ? { key: 'shop', label: 'Boutique', className: 'environment-open-btn', onClick: onOpenEnvironmentMenu }
                      : canModifyWorld && !isOutsideZone && nearCustomizationStation
                        ? { key: 'customize', label: 'Personnaliser', className: 'custom-open-btn', onClick: onOpenCustomizationChoice }
                        : null

  if (!action) return null

  return (
    <div className="interaction-action-slot" role="group" aria-label="Action contextuelle">
      <button
        className={`skin-open-btn interaction-action-btn ${action.className}`.trim()}
        type="button"
        onClick={action.onClick}
        disabled={action.disabled}
      >
        {action.label}
      </button>
    </div>
  )
}
