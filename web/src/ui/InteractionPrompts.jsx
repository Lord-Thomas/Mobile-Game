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
}) {
  const nearOutdoorDoor = useGameStore((s) => s.near.outdoorDoor ?? false)
  const nearMagicSkull = useGameStore((s) => s.near.magicSkullDiscovery ?? false)
  const nearSkinStation = useGameStore((s) => s.near.skinStation ?? false)
  const nearEnvironmentStation = useGameStore((s) => s.near.environmentStation ?? false)
  const nearCustomizationStation = useGameStore((s) => s.near.customizationStation ?? false)
  const nearTv = useGameStore((s) => s.near.tv ?? null)
  const nearYouTubeFrame = useGameStore((s) => s.near.youtubeFrame ?? null)
  const nearSeat = useGameStore((s) => s.near.seat ?? null)

  const menuSkin = useGameStore((s) => s.menus.skin ?? false)
  const menuEnvironment = useGameStore((s) => s.menus.environment ?? false)
  const menuCustomizationChoice = useGameStore((s) => s.menus.customizationChoice ?? false)
  const menuCharacter = useGameStore((s) => s.menus.character ?? false)

  // Exclusion identique à l'original : tous menus fermés.
  const noChoiceMenu = !menuSkin && !menuEnvironment && !menuCustomizationChoice && !menuCharacter

  return (
    <>
      {showCaptureUi && nearOutdoorDoor && modePlay && noChoiceMenu && (
        <button className="skin-open-btn outdoor-open-btn" type="button" onClick={onOutdoorToggle}>
          {isOutsideZone ? 'Entrer' : 'Sortir'}
        </button>
      )}
      {showCaptureUi && isOutsideZone && nearMagicSkull && !magicSkullDiscovered && modePlay && noChoiceMenu && (
        <button className="skin-open-btn custom-open-btn" type="button" onClick={onLearnSkull} disabled={isLearningMagicSkull}>
          {isLearningMagicSkull ? 'Apprentissage...' : 'Apprendre'}
        </button>
      )}
      {showCaptureUi && nearSkinStation && !menuSkin && !menuCustomizationChoice && !menuCharacter && modePlay && (
        <button className="skin-open-btn" type="button" onClick={onOpenSkinMenu}>
          Personnaliser le ballon
        </button>
      )}
      {showCaptureUi && !isOutsideZone && nearEnvironmentStation && !menuEnvironment && !menuCustomizationChoice && !menuCharacter && modePlay && (
        <button className="skin-open-btn environment-open-btn" type="button" onClick={onOpenEnvironmentMenu}>
          Boutique
        </button>
      )}
      {showCaptureUi && canModifyWorld && !isOutsideZone && nearCustomizationStation && modePlay && noChoiceMenu && (
        <button className="skin-open-btn custom-open-btn" type="button" onClick={onOpenCustomizationChoice}>
          Personnaliser
        </button>
      )}
      {showCaptureUi && canModifyWorld && nearTv && modePlay && noChoiceMenu && (
        <button className="skin-open-btn tv-open-btn" type="button" onClick={onRequestTv}>
          TV
        </button>
      )}
      {showCaptureUi && canModifyWorld && nearYouTubeFrame && !youtubeFrameEditorOpen && modePlay && noChoiceMenu && (
        <button className="skin-open-btn youtube-frame-open-btn" type="button" onClick={onEditYouTubeFrame}>
          {nearYouTubeFrame.objectId === 'tiktok_profile_frame' ? 'Modifier le profil TikTok' : 'Modifier la chaîne'}
        </button>
      )}
      {showCaptureUi && nearSeat && modePlay && !seatedPhase && noChoiceMenu && (
        <button className="skin-open-btn seat-open-btn" type="button" onClick={onRequestSit}>
          S'asseoir
        </button>
      )}
      {showCaptureUi && seatedPhase === 'sitting' && (
        <button className="skin-open-btn seat-open-btn" type="button" onClick={onRequestStandUp}>
          Se relever
        </button>
      )}
    </>
  )
}
