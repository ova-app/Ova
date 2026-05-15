# Animations Rive

Stocker ici les fichiers `.riv` avant intégration dans `mobile_app/assets/animations/`.

## 3 animations à créer (Phase 2)

| Fichier | Description | Durée | Taille max |
|---|---|---|---|
| `pr_bronze.riv` | Pulse simple, couleur bronze | 0.8s | 200 KB |
| `pr_silver.riv` | Éclair latéral, couleur argent | 1.2s | 200 KB |
| `pr_gold.riv` | Particules explosives, gold, loop décroissant | 2s | 200 KB |

## Workflow
1. Créer dans Rive (rive.app)
2. Exporter en `.riv`
3. Stocker ici pour review
4. Déplacer dans `mobile_app/assets/animations/`

## Contraintes
- Ne pas utiliser Lottie
- Chaque animation doit pouvoir être interrompue proprement
- Déclenché par événement PR WorkoutContext — pas en polling
