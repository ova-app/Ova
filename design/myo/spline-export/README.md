# Spline Export

Coller ici le code Three.js exporté depuis Spline (spline.design) après prototype.

Ce code sert de base pour l'adaptation à expo-gl dans `mobile_app/app/workout/myo-orb.tsx`.
Ne pas utiliser directement — adapter selon `rules/stack.md` (expo-gl contraintes).

## Checklist avant d'adapter
- [ ] Remplacer MeshPhysicalMaterial → MeshPhongMaterial (WebGL1 only)
- [ ] Supprimer getContext du canvas proxy
- [ ] Ajouter gl.endFrameEXP() après chaque render
- [ ] Passer renderer.setSize(W, H, false) + setPixelRatio(1)
