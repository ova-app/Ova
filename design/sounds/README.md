# Sons — ElevenLabs SFX

Stocker ici les fichiers WAV bruts avant conversion + intégration dans `mobile_app/assets/sounds/`.

## 4 sons à générer (Phase 2)

| Fichier final | Prompt ElevenLabs | Durée |
|---|---|---|
| `serie_end.mp3` | soft satisfying click, premium mobile app, subtle | 0.3s |
| `pr_bronze.mp3` | short chime, achievement, warm metallic | 0.6s |
| `pr_gold.mp3` | triumphant premium chime, gold medal moment, resonant | 1s |
| `myo_reveal.mp3` | deep resonant tone, data crystallizing, premium, fade in | 2s |

## Workflow
1. Générer 5 variations par son sur elevenlabs.io/sound-effects
2. Sélectionner la meilleure variation
3. Convertir WAV → MP3 (< 50 KB par son)
4. Déplacer dans `mobile_app/assets/sounds/`
