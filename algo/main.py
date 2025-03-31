# main.py

from user import Utilisateur
from besoin import calcul_bmr, calcul_tdee

# Exemple utilisateur
u = Utilisateur(sexe="homme", age=25, poids=70, taille=175, activite=1.55, objectif="maintien")

bmr = calcul_bmr(u)
tdee = calcul_tdee(u)

print(f"TDEE : {tdee:.0f} kcal")


