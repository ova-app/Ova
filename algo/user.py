# user.py

class Utilisateur:
    def __init__(self, sexe: str, age: int, poids: float, taille: float, activite: float, objectif: str):
        self.sexe = sexe
        self.age = age
        self.poids = poids  # en kg
        self.taille = taille  # en cm
        self.activite = activite  # facteur PAL
        self.objectif = objectif  # 'perte', 'maintien', 'prise'
